import { randomUUID } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { dmChannelId } from '../../channels/channel.js';
import type { OperationalDatabaseOwner } from '../../database/owner.js';
import { parseMemoryGitUrl, type HttpsFallback } from '../../memory/clone.js';
import { createModelPresetStore, hasPresetEngines } from '../../models/presets.js';
import {
  BOT_DESCRIPTOR_PATH,
  parseBotDescriptor,
  type BotDescriptor,
} from '../../marketplace/descriptor.js';
import {
  bundleBotHistory,
  readBotZip,
  BOT_ZIP_MAX_BYTES,
  BOT_ZIP_MAX_ENTRIES,
} from '../../bots/bot-zip.js';
import { personaBotAvatarFromBytes, type PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import { ZipArchiveError, type ZipEntry } from '../../bots/zip-archive.js';
import type { BotCreateCliIo, BotCreateStep, BotCreateResult, CreateValues } from './cli-types.js';
import { CliFailure, usageError } from './cli-errors.js';
import { trimmed, resolveHome, openRegistry } from './cli-offline.js';
import { assertKnownProvider } from './cli-models.js';

function mintSlug(): string {
  return `bot-${randomUUID().replaceAll('-', '')}`;
}

export function expandGitHubRef(value: string): string | undefined {
  const raw = value.trim();
  if (raw.length === 0) return undefined;
  const shorthand = raw.replace(/^github\.com\//iu, '').replace(/\.git$/iu, '');
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(shorthand)) {
    return `https://github.com/${shorthand}.git`;
  }
  return raw;
}

function zipStem(path: string): string | undefined {
  const stem = path
    .split(/[\\/]/u)
    .at(-1)
    ?.replace(/\.zip$/iu, '')
    .trim();
  return stem !== undefined && stem.length > 0 ? [...stem].slice(0, 60).join('') : undefined;
}

const SKIPPED_BASENAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

interface BundleDirectory {
  files: ZipEntry[];
  descriptor: BotDescriptor | undefined;
  history: Buffer | undefined;
  historySkipped: boolean;
}

function readBundleDirectory(root: string): BundleDirectory {
  let absolute: string;
  try {
    absolute = resolve(root);
    if (!lstatSync(absolute).isDirectory()) throw new Error('not-a-directory');
  } catch {
    throw new CliFailure('bad-bundle', `Cannot read bundle directory: ${root}`, 1);
  }
  const files: ZipEntry[] = [];
  let total = 0;
  let gitPresent = false;
  const walk = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const full = join(directory, entry.name);
      const relativePath = relative(absolute, full).split(sep).join('/');
      if (relativePath === '.git' || relativePath.startsWith('.git/')) {
        gitPresent = true;
        continue;
      }
      const top = relativePath.split('/')[0]!;
      if (top === '__MACOSX' || SKIPPED_BASENAMES.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      let data: Buffer;
      try {
        data = readFileSync(full);
      } catch {
        throw new CliFailure('bad-bundle', `Cannot read bundle file: ${relativePath}`, 1);
      }
      total += data.length;
      if (files.length + 1 > BOT_ZIP_MAX_ENTRIES || total > BOT_ZIP_MAX_BYTES) {
        throw new CliFailure('bad-bundle', 'The bundle directory is too large to import', 1);
      }
      files.push({ path: relativePath, data });
    }
  };
  walk(absolute);
  if (files.length === 0) {
    throw new CliFailure('bad-bundle', 'The bundle directory has no files to import', 1);
  }
  const descriptorFile = files.find((file) => file.path === BOT_DESCRIPTOR_PATH);
  const descriptor =
    descriptorFile === undefined
      ? undefined
      : parseBotDescriptor(descriptorFile.data.toString('utf8'));
  let history: Buffer | undefined;
  let historySkipped = false;
  if (gitPresent) {
    try {
      history = bundleBotHistory(absolute);
    } catch {
      historySkipped = true;
    }
  }
  return { files, descriptor, history, historySkipped };
}

function failureOf(reason: string, detail?: string): CliFailure {
  switch (reason) {
    case 'invalid-git-url':
      return new CliFailure(
        'bad-ref',
        'Provide a Git URL (https://, ssh://, or git@host:path) or a GitHub owner/repo.',
        1,
      );
    case 'git-not-found':
      return new CliFailure('git-not-found', 'A usable Git (2.28 or newer) is missing on PATH.', 1);
    case 'git-clone-failed':
      return new CliFailure(
        'git-clone-failed',
        'The Git repository could not be cloned. Check the ref and network access.',
        1,
      );
    case 'git-clone-timeout':
      return new CliFailure('git-clone-timeout', 'Cloning the Git repository timed out.', 1);
    case 'invalid-zip':
      return new CliFailure('bad-zip', 'The zip file could not be unpacked.', 1);
    case 'memory-unavailable':
      return new CliFailure(
        'memory-unavailable',
        detail === undefined
          ? 'The Bot memory could not be initialized.'
          : `The Bot memory could not be initialized: ${detail}`,
        1,
      );
    case 'invalid-memory-dir':
      return new CliFailure(
        'invalid-memory-dir',
        'The Memory location must be an existing absolute folder that does not already hold this Bot.',
        1,
      );
    case 'duplicate':
      return new CliFailure('invalid-input', 'The minted bot id collided. Retry the command.', 1);
    default:
      return new CliFailure(
        'invalid-input',
        detail === undefined ? 'The bot could not be created.' : detail,
        1,
      );
  }
}

export interface ValidatedCreate {
  displayName: string | undefined;
  persona: string | undefined;
  coreMemory?: string;
  avatar?: string;
  roles: string[] | undefined;
  description: string | undefined;
  presetId: string | undefined;
  memoryLocation?: string;
  source:
    | { kind: 'blank' }
    | { kind: 'git'; gitUrl: string }
    | { kind: 'zip'; path: string }
    | { kind: 'dir'; path: string };
}

export async function validatedCreate(
  values: CreateValues,
  readStdin: () => Promise<string>,
): Promise<ValidatedCreate> {
  const zip = trimmed(values['from-zip']);
  const dir = trimmed(values['from-dir']);
  const git = trimmed(values['from-git']);
  const selected =
    (zip === undefined ? 0 : 1) + (dir === undefined ? 0 : 1) + (git === undefined ? 0 : 1);
  if (selected > 1) {
    throw usageError('Pass exactly one of --from-zip, --from-dir, or --from-git.');
  }
  const name = trimmed(values.name);
  const persona = trimmed(values.persona);
  const personaStdin = values['persona-stdin'] === true;
  if (persona !== undefined && personaStdin) {
    throw usageError('Pass --persona or --persona-stdin, not both.');
  }
  const coreMemory = trimmed(values['core-memory']);
  const coreMemoryStdin = values['core-memory-stdin'] === true;
  if (coreMemory !== undefined && coreMemoryStdin)
    throw usageError('Pass --core-memory or --core-memory-stdin, not both.');
  if (personaStdin && coreMemoryStdin)
    throw usageError('Only one of --persona-stdin and --core-memory-stdin can read stdin.');
  const avatarFile = trimmed(values['avatar-file']);
  if (
    (coreMemory !== undefined || coreMemoryStdin || avatarFile !== undefined) &&
    (zip !== undefined || dir !== undefined || git !== undefined)
  )
    throw usageError('--core-memory and --avatar-file apply to blank bots only.');
  const description = trimmed(values.description);
  const roles =
    values.role === undefined
      ? undefined
      : values.role.map((role) => role.trim()).filter((role) => role.length > 0);
  const presetId = trimmed(values.preset);
  const memoryLocation = trimmed(values['memory-location']);
  if (memoryLocation !== undefined) {
    if (zip !== undefined || dir !== undefined || git !== undefined) {
      throw usageError('--memory-location applies to blank bots only.');
    }
    if (!isAbsolute(memoryLocation)) {
      throw new CliFailure('invalid-input', '--memory-location must be an absolute path.', 1);
    }
  }
  if (git !== undefined) {
    if (persona !== undefined || personaStdin) {
      throw usageError('The persona comes from the Git repository, not --persona.');
    }
    if (name === undefined) throw usageError('--name is required with --from-git.');
    const expanded = expandGitHubRef(git);
    if (expanded === undefined || parseMemoryGitUrl(expanded) === undefined) {
      throw new CliFailure(
        'bad-ref',
        'Provide a Git URL (https://, ssh://, or git@host:path) or a GitHub owner/repo.',
        1,
      );
    }
    return {
      displayName: name,
      persona: undefined,
      roles,
      description,
      presetId,
      source: { kind: 'git', gitUrl: expanded },
    };
  }
  if (zip !== undefined) {
    if (persona !== undefined || personaStdin) {
      throw usageError('The persona comes from the bundle, not --persona.');
    }
    return {
      displayName: name,
      persona: undefined,
      roles,
      description,
      presetId,
      source: { kind: 'zip', path: resolve(zip) },
    };
  }
  if (dir !== undefined) {
    if (persona !== undefined || personaStdin) {
      throw usageError('The persona comes from the bundle, not --persona.');
    }
    return {
      displayName: name,
      persona: undefined,
      roles,
      description,
      presetId,
      source: { kind: 'dir', path: resolve(dir) },
    };
  }
  if (name === undefined) throw usageError('--name is required for a blank bot.');
  const avatar = avatarFile === undefined ? undefined : avatarFromFile(avatarFile);
  const piped = personaStdin || coreMemoryStdin ? (await readStdin()).trim() : '';
  const pipedCoreMemory = coreMemoryStdin && piped.length > 0 ? piped : undefined;
  const chosenCoreMemory = coreMemory ?? pipedCoreMemory;
  return {
    displayName: name,
    persona: personaStdin === true ? (piped.length > 0 ? piped : undefined) : persona,
    ...(chosenCoreMemory === undefined ? {} : { coreMemory: chosenCoreMemory }),
    ...(avatar === undefined ? {} : { avatar }),
    roles,
    description,
    presetId,
    ...(memoryLocation === undefined ? {} : { memoryLocation }),
    source: { kind: 'blank' },
  };
}

function avatarFromFile(path: string): string {
  let bytes: Buffer;
  try {
    bytes = readFileSync(resolve(path));
  } catch {
    throw new CliFailure('file-unreadable', `Cannot read --avatar-file ${path}.`, 1);
  }
  const avatar = personaBotAvatarFromBytes(bytes);
  if (avatar === undefined)
    throw new CliFailure(
      'invalid-avatar',
      '--avatar-file must be a PNG, JPEG or WebP image of at most 128 KiB.',
      1,
    );
  return avatar;
}

export function nextActions(
  channelId: string,
  name: string,
  slug: string,
  modelDeferred: boolean,
): string[] {
  const actions = [`Open DM ${channelId} in the DSH web client to talk to ${name}.`];
  if (modelDeferred) {
    actions.push(
      `Authorize a model in Bot-mode Settings, then message ${name} to verify a live reply.`,
    );
  } else {
    actions.push(`Message ${name} in DM ${channelId} to verify a live reply.`);
  }
  actions.push(`Run \`deepseekbot show ${slug}\` to inspect this bot again.`);
  return actions;
}

export async function runCreate(
  values: CreateValues,
  io: BotCreateCliIo,
  readStdin: () => Promise<string>,
): Promise<BotCreateResult> {
  const validated = await validatedCreate(values, readStdin);
  const dshHome = resolveHome(values, io);
  const steps: BotCreateStep[] = [{ name: 'validate', status: 'ok' }];
  const { owner, registry } = openRegistry(dshHome);
  try {
    if (validated.presetId !== undefined) {
      const presets = createModelPresetStore({
        rootDir: join(dshHome, 'botharness'),
        database: owner,
      });
      const preset = presets.get(validated.presetId);
      if (preset === undefined) {
        throw new CliFailure(
          'unknown-preset',
          `Unknown model preset: ${validated.presetId}`,
          1,
          steps,
        );
      }
      assertKnownProvider(preset.orchestrator.provider, { steps });
      assertKnownProvider(preset.assignmentDefault.provider, { steps });
    }
    let slug = mintSlug();
    steps.push({ name: 'allocate-id', status: 'ok' });
    const base = {
      ...(validated.roles === undefined ? {} : { roles: validated.roles }),
      ...(validated.description === undefined ? {} : { description: validated.description }),
    };
    if (validated.source.kind === 'blank') {
      const attempt = (candidate: string): ReturnType<PersonaBotRegistry['create']> =>
        registry.create({
          slug: candidate,
          displayName: validated.displayName!,
          ...(validated.persona === undefined ? {} : { persona: validated.persona }),
          ...(validated.coreMemory === undefined ? {} : { coreMemory: validated.coreMemory }),
          ...(validated.avatar === undefined ? {} : { avatar: validated.avatar }),
          ...(validated.memoryLocation === undefined
            ? {}
            : { memoryLocation: validated.memoryLocation }),
          ...base,
        });
      let created = attempt(slug);
      if (!created.ok && created.reason === 'duplicate') {
        slug = mintSlug();
        created = attempt(slug);
      }
      if (!created.ok) throw failureOf(created.reason, created.detail);
      steps.push({ name: 'create-bot', status: 'ok' });
      return finishCreate(
        owner,
        registry,
        dshHome,
        slug,
        created.record,
        steps,
        validated.presetId,
      );
    }
    if (validated.source.kind === 'git') {
      const gitUrl = validated.source.gitUrl;
      const attempt = (
        candidate: string,
      ): Promise<Awaited<ReturnType<PersonaBotRegistry['createFromGit']>>> =>
        registry.createFromGit({
          slug: candidate,
          displayName: validated.displayName!,
          gitUrl,
          ...base,
        });
      let created = await attempt(slug);
      if (!created.ok && created.reason === 'duplicate') {
        slug = mintSlug();
        created = await attempt(slug);
      }
      if (!created.ok) throw failureOf(created.reason, created.detail);
      steps.push({ name: 'clone', status: 'ok' });
      steps.push({ name: 'create-bot', status: 'ok' });
      const httpsFallback: HttpsFallback | undefined = created.httpsFallback;
      const result = await finishCreate(
        owner,
        registry,
        dshHome,
        slug,
        created.record,
        steps,
        validated.presetId,
      );
      if (httpsFallback !== undefined) {
        steps.push({
          name: 'clone-fallback',
          status: 'ok',
          detail: `SSH failed (${httpsFallback.reason}); retried over HTTPS.`,
        });
        return {
          ...result,
          httpsFallback: {
            from: httpsFallback.from,
            to: httpsFallback.to,
            reason: httpsFallback.reason,
          },
        };
      }
      return result;
    }
    let bundle: {
      files: ZipEntry[];
      descriptor: BotDescriptor | undefined;
      history: Buffer | undefined;
      historySkipped: boolean;
    };
    if (validated.source.kind === 'zip') {
      bundle = readZipBundle(validated.source.path);
    } else if (validated.source.kind === 'dir') {
      bundle = readDirBundle(validated.source.path);
    } else {
      throw failureOf('invalid-input', 'Select a bundle with --from-zip or --from-dir.');
    }
    const displayName =
      validated.displayName ??
      bundle.descriptor?.name?.trim() ??
      (validated.source.kind === 'zip' ? zipStem(validated.source.path) : undefined) ??
      'Bot';
    const roles = validated.roles ?? bundle.descriptor?.tags;
    const botDescription = validated.description ?? bundle.descriptor?.bio;
    const attempt = (
      candidate: string,
    ): Promise<Awaited<ReturnType<PersonaBotRegistry['createFromFiles']>>> =>
      registry.createFromFiles({
        slug: candidate,
        displayName,
        files: bundle.files,
        ...(bundle.history === undefined ? {} : { history: bundle.history }),
        ...(roles === undefined ? {} : { roles }),
        ...(botDescription === undefined ? {} : { description: botDescription }),
      });
    let created = await attempt(slug);
    if (!created.ok && created.reason === 'duplicate') {
      slug = mintSlug();
      created = await attempt(slug);
    }
    if (!created.ok) throw failureOf(created.reason, created.detail);
    steps.push({
      name: 'read-bundle',
      status: 'ok',
      ...(bundle.historySkipped
        ? { detail: 'Git history was unavailable; imported files only.' }
        : {}),
    });
    steps.push({ name: 'create-bot', status: 'ok' });
    return finishCreate(owner, registry, dshHome, slug, created.record, steps, validated.presetId);
  } finally {
    owner.close();
  }
}

export function readZipBundle(path: string): {
  archive: Buffer;
  files: ZipEntry[];
  descriptor: BotDescriptor | undefined;
  history: Buffer | undefined;
  historySkipped: boolean;
} {
  let archive: Buffer;
  try {
    if (statSync(path).size > BOT_ZIP_MAX_BYTES) throw new Error('too-large');
    archive = readFileSync(path);
  } catch {
    throw new CliFailure('bad-zip', `Cannot read zip file: ${path}`, 1);
  }
  try {
    const contents = readBotZip(archive);
    return {
      archive,
      files: contents.files,
      descriptor: contents.descriptor,
      history: contents.history,
      historySkipped: false,
    };
  } catch (error) {
    if (error instanceof ZipArchiveError) {
      throw new CliFailure('bad-zip', error.message, 1);
    }
    throw new CliFailure('bad-zip', `Cannot read zip file: ${path}`, 1);
  }
}

export function readDirBundle(path: string): {
  files: ZipEntry[];
  descriptor: BotDescriptor | undefined;
  history: Buffer | undefined;
  historySkipped: boolean;
} {
  const bundle = readBundleDirectory(path);
  return {
    files: bundle.files,
    descriptor: bundle.descriptor,
    history: bundle.history,
    historySkipped: bundle.historySkipped,
  };
}

async function finishCreate(
  owner: OperationalDatabaseOwner,
  registry: PersonaBotRegistry,
  dshHome: string,
  slug: string,
  record: PersonaBotRecord,
  steps: BotCreateStep[],
  presetId: string | undefined,
): Promise<BotCreateResult> {
  if (presetId !== undefined) {
    const presets = createModelPresetStore({
      rootDir: join(dshHome, 'botharness'),
      database: owner,
    });
    const preset = presets.get(presetId);
    if (preset === undefined) {
      throw new CliFailure('unknown-preset', `Unknown model preset: ${presetId}`, 1, steps, {
        id: slug,
        name: record.displayName,
      });
    }
    const minted = { id: slug, name: record.displayName };
    assertKnownProvider(preset.orchestrator.provider, { steps, bot: minted });
    assertKnownProvider(preset.assignmentDefault.provider, { steps, bot: minted });
    if (hasPresetEngines(preset))
      throw new CliFailure(
        'engine-unavailable',
        'Apply this Subscription Engine preset through the online Host.',
        1,
      );
    const applied = registry.applyModelPreset(slug, preset);
    if (!applied.ok) {
      throw new CliFailure('unknown-preset', `Unknown model preset: ${presetId}`, 1, steps, {
        id: slug,
        name: record.displayName,
      });
    }
    steps.push({ name: 'model', status: 'ok', detail: `Applied model preset "${preset.name}".` });
  } else {
    steps.push({
      name: 'model',
      status: 'deferred',
      code: 'no-model-yet',
      detail: 'No model preset applied; authorize a model in Bot-mode Settings.',
    });
  }
  const dataDir =
    registry.memoryDirFor(slug) ?? join(dshHome, 'botharness', 'bots', slug, 'memory');
  const channelId = dmChannelId(slug);
  const deferred = steps.some((step) => step.code === 'no-model-yet');
  return {
    bot: { id: slug, name: record.displayName },
    dm: { channelId },
    dataDir,
    steps,
    next: nextActions(channelId, record.displayName, slug, deferred),
  };
}
