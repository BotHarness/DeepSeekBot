import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { seededBotBanner } from '../../bots/bot-banner.js';
import { restoreBotHistory, writeBotFiles } from '../../bots/bot-zip.js';
import { recordMemoryOwnership } from '../../bots/deletion.js';
import {
  isPersonaBotAvatar,
  type CreatePersonaBotInput,
  type CreatePersonaBotResult,
  type PersonaBotRecord,
} from '../../bots/persona-bot.js';
import type {
  MemoryRepositoryInitialization,
  PersonaBotRegistry,
  PersonaBotRegistryOptions,
} from '../../bots/registry.js';
import {
  readSharedBanner,
  readSharedPresentation,
  readSharedPrimaryColor,
} from '../../bots/shared-presentation.js';
import { isValidSlug } from '../../bots/slug.js';
import { OperationalDatabaseError } from '../../database/owner.js';
import { memoryRepositoryMatchesCommit, type HttpsFallback } from '../../memory/clone.js';
import { migrateLegacySoul, seedStandingFiles } from '../../memory/soul.js';
import type { TelemetryEventName } from '../../telemetry/events.js';

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function createRegistryCreationMethods(
  options: PersonaBotRegistryOptions,
  {
    rootDir,
    now,
    botDir,
    defaultMemoryDir,
    memoryDirOf,
    port,
    read,
    write,
    normalizeRoles,
    syncDescriptor,
    capture,
  }: {
    rootDir: string;
    now: () => Date;
    botDir: (slug: string) => string;
    defaultMemoryDir: (slug: string, humanId?: string) => string;
    memoryDirOf: (record: PersonaBotRecord) => string;
    port: Parameters<typeof recordMemoryOwnership>[0];
    read: (slug: string) => PersonaBotRecord | undefined;
    write: (record: PersonaBotRecord, creating?: boolean, ownershipPath?: string) => void;
    normalizeRoles: (roles: readonly string[] | undefined) => string[];
    syncDescriptor: (record: PersonaBotRecord, onlyIfMissing?: boolean) => void;
    capture: (event: TelemetryEventName) => void;
  },
): Pick<
  PersonaBotRegistry,
  'create' | 'createAsync' | 'settled' | 'createFromGit' | 'createFromFiles'
> {
  type Preparation =
    | { kind: 'initialize'; memoryDir: string }
    | { kind: 'descriptor'; memoryDir: string; record: PersonaBotRecord };
  const creating = new Map<string, { humanId: string; settled: Promise<void> }>();
  function* createSteps(
    input: CreatePersonaBotInput,
    sync: boolean,
  ): Generator<Preparation, CreatePersonaBotResult, MemoryRepositoryInitialization> {
    if (!isValidSlug(input.slug)) return { ok: false, reason: 'invalid-slug' };
    if (read(input.slug) !== undefined) return { ok: false, reason: 'duplicate' };

    const explicitMemoryDir = input.memoryDir?.trim();
    if (
      explicitMemoryDir !== undefined &&
      explicitMemoryDir.length > 0 &&
      !isAbsolute(explicitMemoryDir)
    ) {
      return { ok: false, reason: 'invalid-memory-dir' };
    }
    const memoryLocation = input.memoryLocation?.trim();
    let memoryDir =
      explicitMemoryDir ||
      options.defaultMemoryPath?.(input.slug, input.ownerHumanId ?? 'local-human');
    if (memoryLocation !== undefined && memoryLocation.length > 0) {
      if (explicitMemoryDir || !isAbsolute(memoryLocation)) {
        return { ok: false, reason: 'invalid-memory-dir' };
      }
      const parent = resolve(memoryLocation);
      if (!isDirectory(parent)) return { ok: false, reason: 'invalid-memory-dir' };
      memoryDir = join(parent, input.slug);
      if (existsSync(memoryDir)) return { ok: false, reason: 'invalid-memory-dir' };
    }
    const chosenLocation = memoryLocation !== undefined && memoryLocation.length > 0;
    const managedDefault = !explicitMemoryDir && !chosenLocation;

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
      approvalTemplate: '@global',
      ownerHumanId: input.ownerHumanId ?? 'local-human',
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
    try {
      options.validateMemoryPath?.(
        record.slug,
        record.ownerHumanId ?? 'local-human',
        targetMemoryDir,
      );
    } catch {
      return { ok: false, reason: 'invalid-memory-dir' };
    }
    const newMemoryDirectory = !existsSync(targetMemoryDir);
    const newBotDirectory = !existsSync(botDir(record.slug));
    try {
      mkdirSync(targetMemoryDir, { recursive: !chosenLocation });
    } catch (cause) {
      return {
        ok: false,
        reason: 'memory-unavailable',
        detail: cause instanceof Error ? cause.message : String(cause),
      };
    }
    const seeded = seedStandingFiles(targetMemoryDir, {
      ...(input.persona === undefined ? {} : { soul: input.persona }),
      ...(input.coreMemory === undefined ? {} : { coreMemory: input.coreMemory }),
      coreMemoryTemplate: sync,
    });
    let initialized: MemoryRepositoryInitialization;
    try {
      initialized = yield { kind: 'initialize', memoryDir: targetMemoryDir };
      if (initialized.ok && sync) yield { kind: 'descriptor', memoryDir: targetMemoryDir, record };
    } catch (error) {
      if (newMemoryDirectory) rmSync(targetMemoryDir, { recursive: true, force: true });
      else for (const file of seeded) rmSync(join(targetMemoryDir, file), { force: true });
      throw error;
    }
    if (!initialized.ok) {
      for (const file of seeded) rmSync(join(targetMemoryDir, file), { force: true });
      if (newBotDirectory && !memoryDir) {
        rmSync(botDir(record.slug), { recursive: true, force: true });
      }
      if (chosenLocation) rmSync(targetMemoryDir, { recursive: true, force: true });
      return {
        ok: false,
        reason: initialized.code === 'git-not-found' ? 'git-not-found' : 'memory-unavailable',
        ...(initialized.message === undefined ? {} : { detail: initialized.message }),
      };
    }
    try {
      write(record, true, newMemoryDirectory || managedDefault ? targetMemoryDir : undefined);
    } catch (error) {
      if (
        newMemoryDirectory &&
        !(error instanceof OperationalDatabaseError && error.code === 'post-commit-interrupted')
      )
        rmSync(targetMemoryDir, { recursive: true, force: true });
      throw error;
    }
    return { ok: true, record };
  }
  const create = (input: CreatePersonaBotInput, sync: boolean): CreatePersonaBotResult => {
    if (creating.has(input.slug)) return { ok: false, reason: 'duplicate' };
    const steps = createSteps(input, sync);
    let step = steps.next();
    while (!step.done) {
      const work = step.value;
      const result =
        work.kind === 'initialize'
          ? (options.initializeMemory?.(work.memoryDir) ?? { ok: true })
          : (syncDescriptor(work.record), { ok: true });
      step = steps.next(result);
    }
    return step.value;
  };

  const createFromStaging = async (
    input: Omit<CreatePersonaBotInput, 'memoryDir'>,
    prefix: string,
    populate: (
      staging: string,
    ) => Promise<Extract<CreatePersonaBotResult, { ok: false }>['reason'] | undefined>,
    authorize?: () => void,
  ): Promise<CreatePersonaBotResult> => {
    if (!isValidSlug(input.slug)) return { ok: false, reason: 'invalid-slug' };
    if (read(input.slug) !== undefined || existsSync(botDir(input.slug))) {
      return { ok: false, reason: 'duplicate' };
    }

    let staging: string | undefined;
    let ownsBotDir = false;
    let importedMemory: string | undefined;
    let created = false;
    let authorizationError: Error | undefined;
    const checkAuthority = () => {
      try {
        authorize?.();
      } catch (error) {
        authorizationError =
          error instanceof Error ? error : new Error(String(error), { cause: error });
        throw authorizationError;
      }
    };
    try {
      checkAuthority();
      mkdirSync(rootDir, { recursive: true });
      staging = mkdtempSync(join(rootDir, prefix));
      const failure = await populate(staging);
      if (failure !== undefined) return { ok: false, reason: failure };
      checkAuthority();
      if (read(input.slug) !== undefined || existsSync(botDir(input.slug)))
        return { ok: false, reason: 'duplicate' };

      mkdirSync(botDir(input.slug));
      ownsBotDir = true;
      mkdirSync(dirname(defaultMemoryDir(input.slug, input.ownerHumanId ?? 'local-human')), {
        recursive: true,
      });
      const target = defaultMemoryDir(input.slug, input.ownerHumanId ?? 'local-human');
      if (existsSync(target)) return { ok: false, reason: 'invalid-memory-dir' };
      renameSync(staging, target);
      importedMemory = target;
      staging = undefined;
      try {
        migrateLegacySoul(defaultMemoryDir(input.slug, input.ownerHumanId ?? 'local-human'));
      } catch {}
      const result = create(input, false);
      created = result.ok;
      if (!result.ok) return result;
      recordMemoryOwnership(port, result.record.slug, memoryDirOf(result.record));
      capture('bot_library:bot_create');
      const shared = readSharedPresentation(
        defaultMemoryDir(input.slug, input.ownerHumanId ?? 'local-human'),
      );
      const banner = readSharedBanner(
        defaultMemoryDir(input.slug, input.ownerHumanId ?? 'local-human'),
      );
      const primaryColor = readSharedPrimaryColor(
        defaultMemoryDir(input.slug, input.ownerHumanId ?? 'local-human'),
      );
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
      if (authorizationError !== undefined) throw authorizationError;
      return { ok: false, reason: 'memory-unavailable' };
    } finally {
      if (staging !== undefined) rmSync(staging, { recursive: true, force: true });
      if (ownsBotDir && !created && options.database.mode === 'ready') {
        try {
          if (read(input.slug) === undefined) {
            rmSync(botDir(input.slug), { recursive: true, force: true });
            if (importedMemory) rmSync(importedMemory, { recursive: true, force: true });
          }
        } catch {}
      }
    }
  };

  return {
    create(input) {
      const result = create(input, true);
      if (result.ok) capture('bot_library:bot_create');
      return result;
    },
    async createAsync(input, authorize) {
      authorize?.();
      if (creating.has(input.slug)) return { ok: false, reason: 'duplicate' };
      let finish = (): void => {};
      const settled = new Promise<void>((resolve) => {
        finish = resolve;
      });
      creating.set(input.slug, { humanId: input.ownerHumanId ?? 'local-human', settled });
      try {
        const steps = createSteps(input, true);
        let step = steps.next();
        try {
          while (!step.done) {
            const work = step.value;
            let result: MemoryRepositoryInitialization = { ok: true };
            if (work.kind === 'initialize')
              result = options.initializeMemoryAsync
                ? await options.initializeMemoryAsync(work.memoryDir)
                : (options.initializeMemory?.(work.memoryDir) ?? result);
            else {
              try {
                if (options.syncDescriptorAsync)
                  await options.syncDescriptorAsync(work.memoryDir, work.record);
                else syncDescriptor(work.record);
              } catch {}
            }
            authorize?.();
            step = steps.next(result);
          }
        } catch (error) {
          steps.throw(error);
          throw error;
        }
        if (step.value.ok) capture('bot_library:bot_create');
        return step.value;
      } finally {
        creating.delete(input.slug);
        finish();
      }
    },
    async settled(humanId) {
      await Promise.all(
        [...creating.values()]
          .filter((work) => humanId === undefined || work.humanId === humanId)
          .map((work) => work.settled),
      );
    },
    async createFromGit(input, authorize) {
      const { gitUrl, expectedCommit, ...recordInput } = input;
      let httpsFallback: HttpsFallback | undefined;
      const result = await createFromStaging(
        recordInput,
        '.git-import-',
        async (staging) => {
          if (options.cloneMemory === undefined) return 'memory-unavailable';
          const cloned = await options.cloneMemory(staging, gitUrl);
          if (!cloned.ok) return cloned.code;
          httpsFallback = cloned.httpsFallback;
          if (
            expectedCommit !== undefined &&
            !(await memoryRepositoryMatchesCommit(staging, expectedCommit))
          )
            return 'git-source-changed';
          return undefined;
        },
        authorize,
      );
      return result.ok && httpsFallback !== undefined ? { ...result, httpsFallback } : result;
    },
    async createFromFiles(input, authorize) {
      const { files, history, ...recordInput } = input;
      return createFromStaging(
        recordInput,
        '.zip-import-',
        (staging) => {
          try {
            writeBotFiles(staging, files);
            if (history !== undefined) restoreBotHistory(staging, history);
            return Promise.resolve(undefined);
          } catch {
            return Promise.resolve('invalid-zip' as const);
          }
        },
        authorize,
      );
    },
  };
}
