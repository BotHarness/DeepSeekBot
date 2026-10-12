import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  type Dirent,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import { deriveAvatarAppearance } from './avatar-snapshot.js';
import {
  isPersonaBotAvatar,
  isPersonaBotRecord,
  isUsableAvatarAppearance,
  type CreatePersonaBotInput,
  type CreatePersonaBotResult,
  type PersonaBotPatch,
  type PersonaBotRecord,
  type RemovePersonaBotOptions,
  type UpdatePersonaBotResult,
} from './persona-bot.js';
import { isBotBanner, seededBotBanner } from './bot-banner.js';
import {
  isBotPrimaryColor,
  nextBotPrimaryColor,
  retainedBotPrimaryColor,
} from './primary-color.js';
import {
  readSharedBanner,
  readSharedPresentation,
  readSharedPrimaryColor,
} from './shared-presentation.js';
import { isValidSlug } from './slug.js';
import { recordMemoryOwnership } from './deletion.js';
import type { HttpsFallback, MemoryCloneResult } from '../memory/clone.js';
import { restoreBotHistory, writeBotFiles } from './bot-zip.js';
import type { ZipEntry } from './zip-archive.js';
import {
  DEFAULT_STANDING_LIMITS,
  isStandingLimits,
  migrateLegacySoul,
  seedStandingFiles,
  type StandingLimits,
} from '../memory/soul.js';
import type { TelemetryCapture } from '../telemetry/service.js';
import type {
  AssignmentModelOption,
  ModelPreset,
  ModelRoute,
  PersonaBotModelPlan,
} from '../models/presets.js';

export interface MemoryRepositoryInitialization {
  ok: boolean;
  code?: 'git-not-found';
  message?: string;
}

export interface PersonaBotRegistryOptions {
  rootDir: string;
  database: OperationalDatabaseOwner;
  onImport?: (event: { phase: 'complete' | 'failed'; count?: number; durationMs: number }) => void;
  now?: () => Date;
  onDisplayNameChanged?: () => void;
  onAppearanceImported?: (record: PersonaBotRecord) => void;

  initializeMemory?: (memoryDir: string) => MemoryRepositoryInitialization;
  cloneMemory?: (destination: string, url: string) => Promise<MemoryCloneResult>;
  onPurge?: (slug: string, removeFiles: () => void) => void;
  capture?: TelemetryCapture;
  syncDescriptor?: (
    memoryDir: string,
    record: PersonaBotRecord,
    options: { onlyIfMissing: boolean },
  ) => void;
}

export interface PersonaBotRegistry {
  rootDir: string;
  create(input: CreatePersonaBotInput): CreatePersonaBotResult;
  createFromGit(
    input: Omit<CreatePersonaBotInput, 'memoryDir'> & { gitUrl: string },
  ): Promise<CreatePersonaBotResult>;
  createFromFiles(
    input: Omit<CreatePersonaBotInput, 'memoryDir' | 'persona'> & {
      files: readonly ZipEntry[];
      history?: Buffer;
    },
  ): Promise<CreatePersonaBotResult>;
  get(slug: string): PersonaBotRecord | undefined;
  getHistorical(slug: string): PersonaBotRecord | undefined;
  listHistorical(): PersonaBotRecord[];
  list(): PersonaBotRecord[];
  findByWorkspace(workspace: string): PersonaBotRecord | undefined;
  remove(slug: string, options?: RemovePersonaBotOptions): boolean;
  memoryDirFor(slug: string): string | undefined;
  update(slug: string, patch: PersonaBotPatch): UpdatePersonaBotResult;
  setAppearance(slug: string, recipe: unknown): UpdatePersonaBotResult;
  setBanner(slug: string, banner: unknown): UpdatePersonaBotResult;
  setPrimaryColor(slug: string, choice: unknown): UpdatePersonaBotResult;
  retainedRecordBody(slug: string): string | undefined;
  setPaused(slug: string, paused: boolean): UpdatePersonaBotResult;
  setComputerAccess(slug: string, enabled: boolean): UpdatePersonaBotResult;
  setBrowserAccess(slug: string, enabled: boolean): UpdatePersonaBotResult;
  setBrowserProfile(slug: string, profile: string): UpdatePersonaBotResult;
  setStandingLimits(slug: string, limits: StandingLimits): UpdatePersonaBotResult;
  inheritModel(slug: string, expectedRevision: number): UpdatePersonaBotResult;
  applyModelPreset(slug: string, preset: ModelPreset): UpdatePersonaBotResult;
  migrateLegacyModel(
    slug: string,
    expectedModel: string,
    route: ModelRoute,
  ): UpdatePersonaBotResult;
  customizeModelPlan(
    slug: string,
    orchestrator: PersonaBotModelPlan['orchestrator'],
    expectedRevision: number,
  ): UpdatePersonaBotResult;
  setAssignmentModels(
    slug: string,
    assignmentDefault: ModelRoute,
    assignmentModels: AssignmentModelOption[],
    expectedRevision: number,
  ): UpdatePersonaBotResult;
  setModelPlan(
    slug: string,
    routes: {
      orchestrator: ModelRoute;
      assignmentDefault: ModelRoute;
      assignmentModels: AssignmentModelOption[];
    },
    expectedRevision: number,
  ): UpdatePersonaBotResult;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function normalizeWorkspacePath(path: string): string {
  let normalized = path.trim();
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  try {
    return realpathSync.native(normalized);
  } catch {
    return normalized;
  }
}

export function createPersonaBotRegistry(options: PersonaBotRegistryOptions): PersonaBotRegistry {
  const rootDir = options.rootDir;
  const now = options.now ?? (() => new Date());
  const botDir = (slug: string): string => join(rootDir, slug);
  const botFile = (slug: string): string => join(botDir(slug), 'bot.json');
  const defaultMemoryDir = (slug: string): string => join(botDir(slug), 'memory');

  const port = attachOperationalModule(options.database, 'bot-registry');
  const capture = (event: string): void => {
    try {
      options.capture?.(event);
    } catch {
      return;
    }
  };
  const recordSnapshot = (record: PersonaBotRecord): PersonaBotRecord => {
    const result: PersonaBotRecord = {
      slug: record.slug,
      displayName: record.displayName,
      workspaces: [...record.workspaces],
      createdAt: record.createdAt,
    };
    for (const key of [
      'roles',
      'tag',
      'description',
      'avatar',
      'appearance',
      'banner',
      'avatarSeed',
      'model',
      'modelPlanRevision',
      'preset',
      'memoryDir',
      'paused',
      'computerAccess',
      'browserAccess',
      'browserProfile',
    ] as const) {
      if (record[key] !== undefined) Object.assign(result, { [key]: record[key] });
    }
    if (record.primaryColor !== undefined) result.primaryColor = { ...record.primaryColor };
    if (record.standingLimits !== undefined)
      result.standingLimits = {
        soul: record.standingLimits.soul,
        coreMemory: record.standingLimits.coreMemory,
      };
    const route = (value: ModelRoute): ModelRoute => ({
      provider: value.provider,
      model: value.model,
      ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }),
    });
    const plan = record.modelPlan;
    if (plan !== undefined)
      result.modelPlan = {
        revision: plan.revision,
        sourcePresetId: plan.sourcePresetId,
        sourcePresetName: plan.sourcePresetName,
        appliedAt: plan.appliedAt,
        orchestrator: route(plan.orchestrator),
        assignmentDefault: route(plan.assignmentDefault),
        ...(plan.assignmentModels === undefined
          ? {}
          : {
              assignmentModels: plan.assignmentModels.map((option) => ({
                provider: option.provider,
                model: option.model,
                allowedEfforts: [...option.allowedEfforts],
                defaultEffort: option.defaultEffort,
              })),
            }),
      };
    return result;
  };
  const decode = (text: string, slug: string): PersonaBotRecord => {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'appearance' in parsed &&
      !isUsableAvatarAppearance(parsed.appearance, (parsed as { avatar?: unknown }).avatar)
    )
      delete (parsed as { appearance?: unknown }).appearance;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'banner' in parsed &&
      !isBotBanner(parsed.banner)
    )
      delete (parsed as { banner?: unknown }).banner;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'primaryColor' in parsed &&
      !isBotPrimaryColor(parsed.primaryColor)
    )
      delete (parsed as { primaryColor?: unknown }).primaryColor;
    if (!isPersonaBotRecord(parsed, slug)) throw new Error('Invalid PersonaBot Registry record');
    return recordSnapshot(parsed);
  };
  const read = (slug: string): PersonaBotRecord | undefined => {
    if (!isValidSlug(slug)) return undefined;
    return port.read((database) => {
      const row = database.prepare('SELECT body FROM persona_bots WHERE slug = ?').get(slug);
      return row === undefined ? undefined : decode(String(row['body']), slug);
    });
  };
  const write = (record: PersonaBotRecord): void => {
    port.transaction(
      (database) => {
        database
          .prepare(`INSERT INTO persona_bots (slug, body) VALUES (?, ?)
        ON CONFLICT (slug) DO UPDATE SET body = excluded.body`)
          .run(record.slug, JSON.stringify(recordSnapshot(record)));
      },
      ['bot-registry'],
    );
  };
  const deleted = (slug: string): boolean =>
    port.read(
      (database) =>
        database.prepare('SELECT slug FROM persona_bot_deletions WHERE slug = ?').get(slug) !==
        undefined,
    );
  const active = (slug: string): PersonaBotRecord | undefined =>
    deleted(slug) ? undefined : read(slug);
  const list = (): PersonaBotRecord[] =>
    port.read((database) =>
      database
        .prepare('SELECT slug, body FROM persona_bots')
        .all()
        .map((row) => decode(String(row['body']), String(row['slug'])))
        .sort((left, right) => left.slug.localeCompare(right.slug)),
    );
  if (
    options.database.mode === 'ready' &&
    !port.read((database) =>
      database.prepare('SELECT singleton FROM persona_bots_import WHERE singleton = 1').get(),
    )
  ) {
    const startedAt = performance.now();
    const report = (phase: 'complete' | 'failed', count?: number) => {
      try {
        options.onImport?.({
          phase,
          ...(count === undefined ? {} : { count }),
          durationMs: performance.now() - startedAt,
        });
      } catch {}
    };
    try {
      let entries: Dirent[];
      try {
        entries = readdirSync(rootDir, { withFileTypes: true });
      } catch (error) {
        if (!isMissing(error)) throw error;
        entries = [];
      }
      const records: PersonaBotRecord[] = [];
      for (const entry of entries.filter(
        (entry) => entry.isDirectory() && isValidSlug(entry.name),
      )) {
        let text: string;
        try {
          text = readFileSync(botFile(entry.name), 'utf8');
        } catch (error) {
          if (isMissing(error)) continue;
          throw error;
        }
        records.push(decode(text, entry.name));
      }
      port.transaction(
        (database) => {
          if (database.prepare('SELECT slug FROM persona_bots LIMIT 1').get())
            throw new Error('PersonaBot Registry target is populated without an import marker');
          const insert = database.prepare('INSERT INTO persona_bots (slug, body) VALUES (?, ?)');
          for (const record of records) insert.run(record.slug, JSON.stringify(record));
          database
            .prepare('INSERT INTO persona_bots_import (singleton, imported_at) VALUES (1, ?)')
            .run(now().toISOString());
        },
        ['bot-registry'],
      );
      report('complete', records.length);
    } catch {
      report('failed');
      throw new Error(
        'PersonaBot Registry import failed; repair retained legacy records before retry',
      );
    }
  }

  const memoryDirOf = (record: PersonaBotRecord): string =>
    record.memoryDir ?? defaultMemoryDir(record.slug);

  if (options.database.mode === 'ready') {
    for (const record of list()) {
      if (record.memoryDir === undefined && !deleted(record.slug))
        recordMemoryOwnership(port, record.slug, memoryDirOf(record));
    }
  }

  const applyOptionalText = (
    record: PersonaBotRecord,
    key: 'tag' | 'description' | 'avatar' | 'model' | 'preset',
    value: string | undefined,
  ): boolean => {
    if (value === undefined) return true;
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      delete record[key];
      return true;
    }
    if (key === 'avatar' && !isPersonaBotAvatar(trimmed)) return false;
    record[key] = trimmed;
    return true;
  };

  const normalizeRoles = (roles: readonly string[] | undefined): string[] => {
    if (roles === undefined) return [];
    return [...new Set(roles.map((role) => role.trim()).filter((role) => role.length > 0))];
  };

  const syncDescriptor = (record: PersonaBotRecord, onlyIfMissing = false): void => {
    try {
      options.syncDescriptor?.(memoryDirOf(record), record, { onlyIfMissing });
    } catch {}
  };

  const create = (input: CreatePersonaBotInput, sync: boolean): CreatePersonaBotResult => {
    if (!isValidSlug(input.slug)) return { ok: false, reason: 'invalid-slug' };
    if (read(input.slug) !== undefined) return { ok: false, reason: 'duplicate' };

    const memoryDir = input.memoryDir?.trim();
    if (memoryDir !== undefined && memoryDir.length > 0 && !isAbsolute(memoryDir)) {
      return { ok: false, reason: 'invalid-memory-dir' };
    }

    const displayName = input.displayName.trim();
    const roles = normalizeRoles(input.roles);
    const description = input.description?.trim();
    const avatar = input.avatar?.trim();
    if (avatar !== undefined && avatar.length > 0 && !isPersonaBotAvatar(avatar)) {
      return { ok: false, reason: 'invalid-input' };
    }
    const model = input.model?.trim();
    const preset = input.preset?.trim();
    const record: PersonaBotRecord = {
      slug: input.slug,
      displayName: displayName.length > 0 ? displayName : input.slug,
      workspaces: input.workspaces ?? [],
      createdAt: now().toISOString(),
      ...(roles.length > 0 ? { roles } : {}),
      ...(description ? { description } : {}),
      ...(avatar ? { avatar } : {}),
      banner: seededBotBanner(displayName.length > 0 ? displayName : input.slug),
      avatarSeed: 2,
      ...(model ? { model } : {}),
      ...(preset ? { preset } : {}),
      ...(memoryDir ? { memoryDir } : {}),
    };
    const targetMemoryDir = memoryDirOf(record);
    const newMemoryDirectory = !existsSync(targetMemoryDir);
    const newBotDirectory = !existsSync(botDir(record.slug));
    mkdirSync(targetMemoryDir, { recursive: true });
    const seeded = seedStandingFiles(targetMemoryDir, {
      ...(input.persona === undefined ? {} : { soul: input.persona }),
      coreMemoryTemplate: sync,
    });
    const initialized = options.initializeMemory?.(targetMemoryDir) ?? { ok: true };
    if (!initialized.ok) {
      for (const file of seeded) rmSync(join(targetMemoryDir, file), { force: true });
      if (newBotDirectory && !memoryDir) {
        rmSync(botDir(record.slug), { recursive: true, force: true });
      }
      return {
        ok: false,
        reason: initialized.code === 'git-not-found' ? 'git-not-found' : 'memory-unavailable',
        ...(initialized.message === undefined ? {} : { detail: initialized.message }),
      };
    }
    write(record);
    if (newMemoryDirectory || memoryDir === undefined)
      recordMemoryOwnership(port, record.slug, targetMemoryDir);
    if (sync) syncDescriptor(record);
    return { ok: true, record };
  };

  const createFromStaging = async (
    input: Omit<CreatePersonaBotInput, 'memoryDir'>,
    prefix: string,
    populate: (
      staging: string,
    ) => Promise<Extract<CreatePersonaBotResult, { ok: false }>['reason'] | undefined>,
  ): Promise<CreatePersonaBotResult> => {
    if (!isValidSlug(input.slug)) return { ok: false, reason: 'invalid-slug' };
    if (read(input.slug) !== undefined || existsSync(botDir(input.slug))) {
      return { ok: false, reason: 'duplicate' };
    }

    let staging: string | undefined;
    let ownsBotDir = false;
    let created = false;
    try {
      mkdirSync(rootDir, { recursive: true });
      staging = mkdtempSync(join(rootDir, prefix));
      const failure = await populate(staging);
      if (failure !== undefined) return { ok: false, reason: failure };
      if (read(input.slug) !== undefined || existsSync(botDir(input.slug)))
        return { ok: false, reason: 'duplicate' };

      mkdirSync(botDir(input.slug));
      ownsBotDir = true;
      renameSync(staging, defaultMemoryDir(input.slug));
      staging = undefined;
      try {
        migrateLegacySoul(defaultMemoryDir(input.slug));
      } catch {}
      const result = create(input, false);
      created = result.ok;
      if (!result.ok) return result;
      capture('bot_created');
      const shared = readSharedPresentation(defaultMemoryDir(input.slug));
      const banner = readSharedBanner(defaultMemoryDir(input.slug));
      const primaryColor = readSharedPrimaryColor(defaultMemoryDir(input.slug));
      const presentation =
        shared === undefined && banner === undefined && primaryColor === undefined
          ? undefined
          : {
              ...shared,
              ...(banner === undefined ? {} : { banner }),
              ...(primaryColor === undefined ? {} : { primaryColor }),
            };
      if (presentation === undefined) {
        syncDescriptor(result.record, true);
        return result;
      }
      const presented = { ...result.record, ...presentation };
      try {
        write(presented);
      } catch {
        syncDescriptor(result.record, true);
        return result;
      }
      if (presented.appearance !== undefined)
        try {
          options.onAppearanceImported?.(presented);
        } catch {}
      syncDescriptor(presented, true);
      return { ok: true, record: presented };
    } catch {
      return { ok: false, reason: 'memory-unavailable' };
    } finally {
      if (staging !== undefined) rmSync(staging, { recursive: true, force: true });
      if (ownsBotDir && !created && options.database.mode === 'ready') {
        try {
          if (read(input.slug) === undefined)
            rmSync(botDir(input.slug), { recursive: true, force: true });
        } catch {}
      }
    }
  };

  return {
    rootDir,
    create(input) {
      const result = create(input, true);
      if (result.ok) capture('bot_created');
      return result;
    },
    async createFromGit(input) {
      const { gitUrl, ...recordInput } = input;
      let httpsFallback: HttpsFallback | undefined;
      const result = await createFromStaging(recordInput, '.git-import-', async (staging) => {
        if (options.cloneMemory === undefined) return 'memory-unavailable';
        const cloned = await options.cloneMemory(staging, gitUrl);
        if (!cloned.ok) return cloned.code;
        httpsFallback = cloned.httpsFallback;
        return undefined;
      });
      return result.ok && httpsFallback !== undefined ? { ...result, httpsFallback } : result;
    },
    async createFromFiles(input) {
      const { files, history, ...recordInput } = input;
      return createFromStaging(recordInput, '.zip-import-', (staging) => {
        try {
          writeBotFiles(staging, files);
          if (history !== undefined) restoreBotHistory(staging, history);
          return Promise.resolve(undefined);
        } catch {
          return Promise.resolve('invalid-zip' as const);
        }
      });
    },
    get: active,
    getHistorical: read,
    listHistorical: list,
    list: () => list().filter((record) => !deleted(record.slug)),
    findByWorkspace(workspace) {
      const target = normalizeWorkspacePath(workspace);
      if (target.length === 0) return undefined;
      return list()
        .filter((record) => !deleted(record.slug))
        .find((record) =>
          record.workspaces.some((candidate) => normalizeWorkspacePath(candidate) === target),
        );
    },
    remove(slug) {
      if (!isValidSlug(slug) || read(slug) === undefined) return false;
      throw new Error('Use confirmed PersonaBot deletion; direct Registry removal is unavailable');
    },
    memoryDirFor(slug) {
      const record = read(slug);
      if (record === undefined) return undefined;
      return memoryDirOf(record);
    },
    update(slug, patch) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const previousName = record.displayName;
      const previousAvatar = record.avatar;
      const previousProfile = JSON.stringify([
        record.roles,
        record.tag,
        record.description,
        record.avatar,
      ]);
      if (patch.displayName !== undefined) {
        const displayName = patch.displayName.trim();
        if (displayName.length === 0) return { ok: false, reason: 'invalid-input' };
        record.displayName = displayName;
      }
      if (patch.roles !== undefined) {
        if (!Array.isArray(patch.roles) || !patch.roles.every((role) => typeof role === 'string')) {
          return { ok: false, reason: 'invalid-input' };
        }
        const roles = normalizeRoles(patch.roles);
        if (roles.length === 0) delete record.roles;
        else record.roles = roles;
        delete record.tag;
      }
      applyOptionalText(record, 'description', patch.description);
      if (!applyOptionalText(record, 'avatar', patch.avatar)) {
        return { ok: false, reason: 'invalid-input' };
      }
      if (patch.avatar !== undefined) delete record.appearance;
      applyOptionalText(record, 'model', patch.model);
      applyOptionalText(record, 'preset', patch.preset);
      if (patch.workspaces !== undefined) {
        if (
          !Array.isArray(patch.workspaces) ||
          !patch.workspaces.every((workspace) => typeof workspace === 'string')
        ) {
          return { ok: false, reason: 'invalid-input' };
        }
        record.workspaces = [...patch.workspaces];
      }
      write(record);
      if (record.displayName !== previousName) options.onDisplayNameChanged?.();
      if (patch.avatar !== undefined && record.avatar !== previousAvatar) capture('avatar_edited');
      if (
        record.displayName !== previousName ||
        JSON.stringify([record.roles, record.tag, record.description, record.avatar]) !==
          previousProfile
      )
        syncDescriptor(record);
      return { ok: true, record };
    },
    setAppearance(slug, recipe) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const derived = deriveAvatarAppearance(recipe);
      if (derived === undefined) return { ok: false, reason: 'invalid-input' };
      const updated = { ...record, ...derived };
      write(updated);
      syncDescriptor(updated);
      capture('avatar_edited');
      return { ok: true, record: updated };
    },
    setBanner(slug, banner) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (!isBotBanner(banner)) return { ok: false, reason: 'invalid-input' };
      const updated = { ...record, banner };
      write(updated);
      syncDescriptor(updated);
      capture('banner_edited');
      return { ok: true, record: updated };
    },
    setPrimaryColor(slug, choice) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const next = nextBotPrimaryColor(record.primaryColor, choice);
      if (next === false) return { ok: false, reason: 'invalid-input' };
      const { primaryColor: _previous, ...rest } = record;
      const updated = next === undefined ? rest : { ...rest, primaryColor: next };
      write(updated);
      syncDescriptor(updated);
      return { ok: true, record: updated };
    },
    retainedRecordBody(slug) {
      const record = active(slug);
      if (record === undefined) return undefined;
      return JSON.stringify(
        recordSnapshot({ ...record, primaryColor: retainedBotPrimaryColor(record) }),
      );
    },
    setPaused(slug, paused) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const archiving = paused && record.paused !== true;
      if (paused) record.paused = true;
      else delete record.paused;
      write(record);
      if (archiving) capture('bot_archived');
      return { ok: true, record };
    },
    setComputerAccess(slug, enabled) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (enabled) record.computerAccess = true;
      else delete record.computerAccess;
      write(record);
      return { ok: true, record };
    },
    setBrowserAccess(slug, enabled) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (enabled) record.browserAccess = true;
      else delete record.browserAccess;
      write(record);
      return { ok: true, record };
    },
    setBrowserProfile(slug, profile) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const trimmed = profile.trim();
      if (trimmed === '') delete record.browserProfile;
      else record.browserProfile = trimmed;
      write(record);
      return { ok: true, record };
    },
    setStandingLimits(slug, limits) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (!isStandingLimits(limits)) return { ok: false, reason: 'invalid-input' };
      if (
        limits.soul === DEFAULT_STANDING_LIMITS.soul &&
        limits.coreMemory === DEFAULT_STANDING_LIMITS.coreMemory
      )
        delete record.standingLimits;
      else record.standingLimits = { soul: limits.soul, coreMemory: limits.coreMemory };
      write(record);
      return { ok: true, record };
    },
    inheritModel(slug, expectedRevision) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const revision = record.modelPlan?.revision ?? record.modelPlanRevision ?? 0;
      if (revision !== expectedRevision) return { ok: false, reason: 'invalid-input' };
      if (record.modelPlan === undefined && record.model === undefined) return { ok: true, record };
      record.modelPlanRevision = revision + 1;
      delete record.modelPlan;
      delete record.model;
      write(record);
      return { ok: true, record };
    },
    applyModelPreset(slug, preset) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const plan: PersonaBotModelPlan = {
        revision: (record.modelPlan?.revision ?? record.modelPlanRevision ?? 0) + 1,
        sourcePresetId: preset.id,
        sourcePresetName: preset.name,
        orchestrator: { ...preset.orchestrator },
        assignmentDefault: { ...preset.assignmentDefault },
        ...(preset.assignmentModels === undefined
          ? {}
          : {
              assignmentModels: preset.assignmentModels.map((option) => ({
                ...option,
                allowedEfforts: [...option.allowedEfforts],
              })),
            }),
        appliedAt: now().toISOString(),
      };
      record.modelPlan = plan;
      delete record.model;
      write(record);
      return { ok: true, record };
    },
    migrateLegacyModel(slug, expectedModel, route) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (record.modelPlan !== undefined) return { ok: true, record };
      if (record.model !== expectedModel) return { ok: false, reason: 'invalid-input' };
      record.modelPlan = {
        revision: 1,
        sourcePresetId: '',
        sourcePresetName: '',
        orchestrator: { ...route },
        assignmentDefault: { ...route },
        appliedAt: now().toISOString(),
      };
      delete record.model;
      write(record);
      return { ok: true, record };
    },
    customizeModelPlan(slug, orchestrator, expectedRevision) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (record.modelPlan === undefined) return { ok: false, reason: 'invalid-input' };
      if (record.modelPlan.revision !== expectedRevision)
        return { ok: false, reason: 'invalid-input' };
      record.modelPlan = {
        ...record.modelPlan,
        revision: record.modelPlan.revision + 1,
        sourcePresetId: '',
        sourcePresetName: '',
        orchestrator: { ...orchestrator },
        appliedAt: now().toISOString(),
      };
      write(record);
      return { ok: true, record };
    },
    setAssignmentModels(slug, assignmentDefault, assignmentModels, expectedRevision) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (record.modelPlan === undefined || record.modelPlan.revision !== expectedRevision)
        return { ok: false, reason: 'invalid-input' };
      record.modelPlan = {
        ...record.modelPlan,
        revision: record.modelPlan.revision + 1,
        sourcePresetId: '',
        sourcePresetName: '',
        assignmentDefault: { ...assignmentDefault },
        assignmentModels: assignmentModels.map((option) => ({
          ...option,
          allowedEfforts: [...option.allowedEfforts],
        })),
        appliedAt: now().toISOString(),
      };
      write(record);
      return { ok: true, record };
    },
    setModelPlan(slug, routes, expectedRevision) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const revision = record.modelPlan?.revision ?? record.modelPlanRevision ?? 0;
      if (revision !== expectedRevision) return { ok: false, reason: 'invalid-input' };
      record.modelPlan = {
        revision: revision + 1,
        sourcePresetId: '',
        sourcePresetName: '',
        orchestrator: { ...routes.orchestrator },
        assignmentDefault: { ...routes.assignmentDefault },
        assignmentModels: routes.assignmentModels.map((option) => ({
          ...option,
          allowedEfforts: [...option.allowedEfforts],
        })),
        appliedAt: now().toISOString(),
      };
      delete record.model;
      write(record);
      return { ok: true, record };
    },
  };
}
