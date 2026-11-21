import { isTob, TobError } from '../tob/service.js';
import type { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, realpathSync, type Dirent } from 'node:fs';
import { join } from 'node:path';

import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import { deriveAvatarAppearance } from './avatar-snapshot.js';
import {
  isPersonaBotAvatar,
  isPersonaBotRecord,
  isPersonaBotAsr,
  isPersonaBotVoice,
  isUsableAvatarAppearance,
  type CreatePersonaBotInput,
  type CreatePersonaBotResult,
  type MarketplaceListingRef,
  type PersonaBotPatch,
  type PersonaBotRecord,
  type PersonaBotAsr,
  type PersonaBotVoice,
  type RemovePersonaBotOptions,
  type UpdatePersonaBotResult,
} from './persona-bot.js';
import { isBotBanner } from './bot-banner.js';
import {
  isBotPrimaryColor,
  nextBotPrimaryColor,
  retainedBotPrimaryColor,
} from './primary-color.js';
import { createRegistryCreationMethods } from '../features/personabots/registry-creation.js';
import { isValidSlug } from './slug.js';
import { memoryOwnership, recordMemoryOwnership, transferMemoryOwnership } from './deletion.js';
import type { MemoryCloneResult } from '../memory/clone.js';
import type { ZipEntry } from './zip-archive.js';
import { DEFAULT_STANDING_LIMITS, isStandingLimits, type StandingLimits } from '../memory/soul.js';
import type { TelemetryEventName } from '../telemetry/events.js';
import type { TelemetryCapture } from '../telemetry/service.js';
import {
  isPersonaBotModelPlan,
  presetGroups,
  type AssignmentGroupOption,
  type AssignmentModelOption,
  type ModelPreset,
  type ModelPresetGroups,
  type ModelRoute,
  type PersonaBotModelPlan,
} from '../models/presets.js';
import { parsePromptLimitValues, type PromptLimitValues } from '../prompts/prompt-limits.js';
import { parsePromptPartOverrides, type PromptPartOverrides } from '../prompts/prompt-presets.js';

export interface MemoryRepositoryInitialization {
  ok: boolean;
  code?: 'git-not-found';
  message?: string;
}

export interface PersonaBotRegistryOptions {
  rootDir: string;
  defaultMemoryPath?: (slug: string, humanId: string) => string;
  validateMemoryPath?: (slug: string, humanId: string, path: string) => void;
  onCreated?: (record: PersonaBotRecord, database: DatabaseSync) => void;
  creationTopics?: readonly string[];
  database: OperationalDatabaseOwner;
  onImport?: (event: { phase: 'complete' | 'failed'; count?: number; durationMs: number }) => void;
  now?: () => Date;
  onDisplayNameChanged?: () => void;
  onAvatarChanged?: () => void;
  onAppearanceImported?: (record: PersonaBotRecord) => void;

  initializeMemory?: (memoryDir: string) => MemoryRepositoryInitialization;
  initializeMemoryAsync?: (memoryDir: string) => Promise<MemoryRepositoryInitialization>;
  syncDescriptorAsync?: (memoryDir: string, record: PersonaBotRecord) => Promise<void>;
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
  createAsync(
    input: CreatePersonaBotInput,
    authorize?: () => void,
  ): Promise<CreatePersonaBotResult>;
  settled(humanId?: string): Promise<void>;
  createFromGit(
    input: Omit<CreatePersonaBotInput, 'memoryDir'> & { gitUrl: string; expectedCommit?: string },
    authorize?: () => void,
  ): Promise<CreatePersonaBotResult>;
  createFromFiles(
    input: Omit<CreatePersonaBotInput, 'memoryDir' | 'persona'> & {
      files: readonly ZipEntry[];
      history?: Buffer;
    },
    authorize?: () => void,
  ): Promise<CreatePersonaBotResult>;
  get(slug: string): PersonaBotRecord | undefined;
  getHistorical(slug: string): PersonaBotRecord | undefined;
  listHistorical(ownerHumanId?: string): PersonaBotRecord[];
  list(ownerHumanId?: string): PersonaBotRecord[];
  findByWorkspace(workspace: string): PersonaBotRecord | undefined;
  remove(slug: string, options?: RemovePersonaBotOptions): boolean;
  memoryDirFor(slug: string): string | undefined;
  defaultMemoryDirFor(slug: string): string;
  setMemoryDir(slug: string, memoryDir: string | undefined): UpdatePersonaBotResult;
  update(slug: string, patch: PersonaBotPatch): UpdatePersonaBotResult;
  setAppearance(
    slug: string,
    recipe: unknown,
    origin?: 'custom' | 'default',
  ): UpdatePersonaBotResult;
  setBanner(slug: string, banner: unknown): UpdatePersonaBotResult;
  setPrimaryColor(slug: string, choice: unknown): UpdatePersonaBotResult;
  retainedRecordBody(slug: string): string | undefined;
  setPaused(slug: string, paused: boolean): UpdatePersonaBotResult;
  setComputerAccess(slug: string, enabled: boolean): UpdatePersonaBotResult;
  setBrowserAccess(slug: string, enabled: boolean): UpdatePersonaBotResult;
  setBrowserProfile(slug: string, profile: string): UpdatePersonaBotResult;
  setApprovalTemplate(slug: string, template: string | undefined): UpdatePersonaBotResult;
  setVoice(slug: string, voice: PersonaBotVoice | undefined): UpdatePersonaBotResult;
  setAsr(slug: string, asr: PersonaBotAsr | undefined): UpdatePersonaBotResult;
  setMarketplaceListing(slug: string, listing: MarketplaceListingRef): UpdatePersonaBotResult;
  setMarketplaceUpload(
    slug: string,
    listing: MarketplaceListingRef | undefined,
  ): UpdatePersonaBotResult;
  setPromptSettings(
    slug: string,
    settings: {
      preset?: string | null;
      overrides?: PromptPartOverrides;
      limits?: PromptLimitValues;
    },
  ): UpdatePersonaBotResult;
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
    orchestratorGroupId?: string,
    orchestratorGroupEffort?: string,
  ): UpdatePersonaBotResult;
  setAssignmentModels(
    slug: string,
    assignmentDefault: ModelRoute,
    assignmentModels: AssignmentModelOption[],
    expectedRevision: number,
    openAssignmentModels?: boolean,
    groups?: { ids: string[]; defaultId?: string; options?: AssignmentGroupOption[] },
  ): UpdatePersonaBotResult;
  setModelPlan(
    slug: string,
    routes: {
      orchestrator: ModelRoute;
      assignmentDefault: ModelRoute;
      assignmentModels: AssignmentModelOption[];
      openAssignmentModels?: boolean;
      groups?: ModelPresetGroups;
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
  mkdirSync(options.rootDir, { recursive: true });
  const rootDir = realpathSync(options.rootDir);
  const now = options.now ?? (() => new Date());
  const botDir = (slug: string): string => join(rootDir, slug);
  const botFile = (slug: string): string => join(botDir(slug), 'bot.json');
  const defaultMemoryDir = (slug: string, humanId = 'local-human'): string =>
    options.defaultMemoryPath?.(slug, humanId) ?? join(botDir(slug), 'memory');

  const port = attachOperationalModule(options.database, 'bot-registry');
  const capture = (event: TelemetryEventName): void => {
    try {
      options.capture?.(event);
    } catch {
      return;
    }
  };
  const recordSnapshot = (record: PersonaBotRecord): PersonaBotRecord => {
    const result: PersonaBotRecord = {
      ownerHumanId: record.ownerHumanId ?? 'local-human',
      slug: record.slug,
      displayName: record.displayName,
      workspaces: [...record.workspaces],
      createdAt: record.createdAt,
    };
    for (const key of [
      'ownerHumanId',
      'displayNameCustomized',
      'avatarCustomized',
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
      'approvalTemplate',
      'promptPreset',
    ] as const) {
      if (record[key] !== undefined) Object.assign(result, { [key]: record[key] });
    }
    if (record.primaryColor !== undefined) result.primaryColor = { ...record.primaryColor };
    if (record.voice !== undefined) result.voice = { ...record.voice };
    if (record.asr !== undefined) result.asr = { ...record.asr };
    if (record.promptOverrides !== undefined) {
      const overrides = parsePromptPartOverrides(record.promptOverrides);
      if (overrides !== undefined && Object.keys(overrides).length > 0)
        result.promptOverrides = overrides;
    }
    if (record.promptLimits !== undefined) {
      const limits = parsePromptLimitValues(record.promptLimits);
      if (Object.keys(limits).length > 0) result.promptLimits = limits;
    }
    if (record.marketplaceListing !== undefined)
      result.marketplaceListing = { ...record.marketplaceListing };
    if (record.marketplaceUpload !== undefined)
      result.marketplaceUpload = { ...record.marketplaceUpload };
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
        ...(plan.orchestratorGroupId === undefined
          ? {}
          : { orchestratorGroupId: plan.orchestratorGroupId }),
        ...(plan.orchestratorGroupEffort === undefined
          ? {}
          : { orchestratorGroupEffort: plan.orchestratorGroupEffort }),
        ...(plan.assignmentGroups === undefined
          ? {}
          : { assignmentGroups: [...plan.assignmentGroups] }),
        ...(plan.assignmentDefaultGroupId === undefined
          ? {}
          : { assignmentDefaultGroupId: plan.assignmentDefaultGroupId }),
        ...(plan.assignmentGroupOptions === undefined
          ? {}
          : {
              assignmentGroupOptions: plan.assignmentGroupOptions.map((option) => ({
                ...option,
                ...(option.allowedEfforts === undefined
                  ? {}
                  : { allowedEfforts: [...option.allowedEfforts] }),
              })),
            }),
        ...(plan.assignmentDefault === undefined
          ? {}
          : { assignmentDefault: route(plan.assignmentDefault) }),
        ...(plan.assignmentModels === undefined
          ? {}
          : {
              assignmentModels: plan.assignmentModels.map((option) => ({
                provider: option.provider,
                model: option.model,
                allowedEfforts: [...option.allowedEfforts],
                defaultEffort: option.defaultEffort,
                ...(option.note === undefined ? {} : { note: option.note }),
              })),
            }),
        ...(plan.openAssignmentModels === true ? { openAssignmentModels: true } : {}),
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
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'modelPlan' in parsed &&
      !isPersonaBotModelPlan(parsed.modelPlan)
    )
      delete parsed.modelPlan;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'modelPlanRevision' in parsed &&
      (typeof parsed.modelPlanRevision !== 'number' ||
        !Number.isSafeInteger(parsed.modelPlanRevision) ||
        parsed.modelPlanRevision < 0)
    )
      delete parsed.modelPlanRevision;
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
  const write = (record: PersonaBotRecord, creating = false, ownershipPath?: string): void => {
    const slug = record.slug;
    if (!isPersonaBotRecord(record, slug))
      throw new Error(`Refusing to persist an invalid PersonaBot Registry record: ${slug}`);
    port.transaction(
      (database) => {
        database
          .prepare(`INSERT INTO persona_bots (slug, body, owner_human_id) VALUES (?, ?, ?)
        ON CONFLICT (slug) DO UPDATE SET body = excluded.body, owner_human_id = excluded.owner_human_id`)
          .run(
            record.slug,
            JSON.stringify(recordSnapshot(record)),
            record.ownerHumanId ?? 'local-human',
          );
        if (ownershipPath) {
          let proof: ReturnType<typeof memoryOwnership>;
          try {
            proof = memoryOwnership(ownershipPath);
          } catch {
            proof = { path: '', device: -1, inode: -1 };
          }
          database
            .prepare('INSERT OR IGNORE INTO persona_bot_memory_ownership VALUES (?, ?)')
            .run(record.slug, JSON.stringify(proof));
        }
        if (creating) options.onCreated?.(record, database);
      },
      ['bot-registry', ...(creating ? (options.creationTopics ?? []) : [])],
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
  const list = (ownerHumanId?: string): PersonaBotRecord[] =>
    port.read((database) =>
      database
        .prepare(
          ownerHumanId === undefined
            ? 'SELECT slug, body FROM persona_bots'
            : 'SELECT slug, body FROM persona_bots WHERE owner_human_id = ?',
        )
        .all(...(ownerHumanId === undefined ? [] : [ownerHumanId]))
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
    record.memoryDir ?? defaultMemoryDir(record.slug, record.ownerHumanId ?? 'local-human');

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

  return {
    rootDir,
    ...createRegistryCreationMethods(options, {
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
    }),
    get: active,
    getHistorical: read,
    listHistorical: list,
    list: (ownerHumanId) => list(ownerHumanId).filter((record) => !deleted(record.slug)),
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
    defaultMemoryDirFor(slug) {
      return defaultMemoryDir(slug, read(slug)?.ownerHumanId ?? 'local-human');
    },
    setMemoryDir(slug, memoryDir) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const updated = { ...record };
      options.validateMemoryPath?.(
        slug,
        record.ownerHumanId ?? 'local-human',
        memoryDir ?? defaultMemoryDir(slug, record.ownerHumanId ?? 'local-human'),
      );
      if (
        memoryDir === undefined ||
        memoryDir === defaultMemoryDir(slug, record.ownerHumanId ?? 'local-human')
      )
        delete updated.memoryDir;
      else updated.memoryDir = memoryDir;
      write(updated);
      transferMemoryOwnership(port, slug, memoryDirOf(updated));
      return { ok: true, record: updated };
    },
    update(slug, patch) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const previousName = record.displayName;
      const previousAvatar = record.avatar;
      const previousAppearance = record.appearance;
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
        if (isTob(port, slug)) record.displayNameCustomized = true;
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
      if (patch.avatar !== undefined) {
        delete record.appearance;
        if (isTob(port, slug)) {
          if (record.avatar) record.avatarCustomized = true;
          else delete record.avatarCustomized;
        }
      }
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
      if (record.avatar !== previousAvatar || record.appearance !== previousAppearance)
        options.onAvatarChanged?.();
      if (patch.avatar !== undefined && record.avatar !== previousAvatar)
        capture('bot_profile:avatar_update');
      if (
        record.displayName !== previousName ||
        JSON.stringify([record.roles, record.tag, record.description, record.avatar]) !==
          previousProfile
      )
        syncDescriptor(record);
      return { ok: true, record };
    },
    setAppearance(slug, recipe, origin = 'custom') {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const derived = deriveAvatarAppearance(recipe);
      if (derived === undefined) return { ok: false, reason: 'invalid-input' };
      const updated = { ...record, ...derived };
      if (isTob(port, slug) && origin === 'custom') updated.avatarCustomized = true;
      write(updated);
      if (record.appearance?.revision !== updated.appearance.revision) options.onAvatarChanged?.();
      syncDescriptor(updated);
      capture('bot_profile:avatar_update');
      return { ok: true, record: updated };
    },
    setBanner(slug, banner) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (!isBotBanner(banner)) return { ok: false, reason: 'invalid-input' };
      const updated = { ...record, banner };
      write(updated);
      syncDescriptor(updated);
      capture('bot_profile:banner_update');
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
      if (paused && isTob(port, slug)) throw new TobError('protected-bot');
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const archiving = paused && record.paused !== true;
      if (paused) record.paused = true;
      else delete record.paused;
      write(record);
      if (archiving) capture('bot_library:bot_archive');
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
    setApprovalTemplate(slug, template) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (template === undefined) delete record.approvalTemplate;
      else record.approvalTemplate = template;
      write(record);
      return { ok: true, record };
    },
    setVoice(slug, voice) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (voice !== undefined && !isPersonaBotVoice(voice))
        return { ok: false, reason: 'invalid-input' };
      if (voice === undefined) delete record.voice;
      else
        record.voice = {
          providerId: voice.providerId,
          ...(voice.voiceId === undefined ? {} : { voiceId: voice.voiceId.trim() }),
        };
      write(record);
      return { ok: true, record };
    },
    setAsr(slug, asr) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (asr !== undefined && !isPersonaBotAsr(asr)) return { ok: false, reason: 'invalid-input' };
      if (asr === undefined) delete record.asr;
      else
        record.asr = {
          providerId: asr.providerId,
          ...(asr.language === undefined ? {} : { language: asr.language }),
        };
      write(record);
      return { ok: true, record };
    },
    setMarketplaceListing(slug, listing) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      record.marketplaceListing = { id: listing.id, pushedAt: listing.pushedAt };
      write(record);
      return { ok: true, record };
    },
    setMarketplaceUpload(slug, listing) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (listing === undefined) delete record.marketplaceUpload;
      else record.marketplaceUpload = { id: listing.id, pushedAt: listing.pushedAt };
      write(record);
      return { ok: true, record };
    },
    setPromptSettings(slug, settings) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (settings.preset === null) delete record.promptPreset;
      else if (settings.preset !== undefined) record.promptPreset = settings.preset;
      if (settings.overrides !== undefined) {
        if (Object.keys(settings.overrides).length === 0) delete record.promptOverrides;
        else record.promptOverrides = settings.overrides;
      }
      if (settings.limits !== undefined) {
        if (Object.keys(settings.limits).length === 0) delete record.promptLimits;
        else record.promptLimits = settings.limits;
      }
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
      syncDescriptor(record);
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
        ...(preset.openAssignmentModels === true ? { openAssignmentModels: true } : {}),
        ...presetGroups(preset),
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
    customizeModelPlan(
      slug,
      orchestrator,
      expectedRevision,
      orchestratorGroupId,
      orchestratorGroupEffort,
    ) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (record.model !== undefined) return { ok: false, reason: 'invalid-input' };
      const revision = record.modelPlan?.revision ?? record.modelPlanRevision ?? 0;
      if (revision !== expectedRevision) return { ok: false, reason: 'invalid-input' };
      const {
        orchestratorGroupId: _previousGroup,
        orchestratorGroupEffort: _previousEffort,
        ...kept
      } = record.modelPlan ?? {};
      record.modelPlan = {
        ...kept,
        revision: revision + 1,
        sourcePresetId: '',
        sourcePresetName: '',
        orchestrator: { ...orchestrator },
        ...(orchestratorGroupId === undefined ? {} : { orchestratorGroupId }),
        ...(orchestratorGroupId === undefined ||
        orchestratorGroupEffort === undefined ||
        orchestratorGroupEffort.trim() === ''
          ? {}
          : { orchestratorGroupEffort: orchestratorGroupEffort.trim() }),
        appliedAt: now().toISOString(),
      };
      write(record);
      return { ok: true, record };
    },
    setAssignmentModels(
      slug,
      assignmentDefault,
      assignmentModels,
      expectedRevision,
      openAssignmentModels,
      groups,
    ) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (record.modelPlan === undefined || record.modelPlan.revision !== expectedRevision)
        return { ok: false, reason: 'invalid-input' };
      const {
        openAssignmentModels: currentOpen,
        assignmentGroups: currentGroups,
        assignmentDefaultGroupId: currentDefaultGroup,
        assignmentGroupOptions: currentOptions,
        ...plan
      } = record.modelPlan;
      const open = openAssignmentModels ?? currentOpen === true;
      const ids = groups === undefined ? (currentGroups ?? []) : groups.ids;
      const defaultGroup = groups === undefined ? currentDefaultGroup : groups.defaultId;
      const options = (groups?.options ?? currentOptions)?.filter((option) =>
        ids.includes(option.group),
      );
      record.modelPlan = {
        ...plan,
        ...(open ? { openAssignmentModels: true } : {}),
        ...(ids.length === 0 ? {} : { assignmentGroups: [...ids] }),
        ...(ids.length === 0 || defaultGroup === undefined
          ? {}
          : { assignmentDefaultGroupId: defaultGroup }),
        ...(options === undefined || options.length === 0
          ? {}
          : { assignmentGroupOptions: options.map((option) => ({ ...option })) }),
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
        ...(routes.openAssignmentModels === true ? { openAssignmentModels: true } : {}),
        ...(routes.groups === undefined ? {} : presetGroups(routes.groups)),
        appliedAt: now().toISOString(),
      };
      delete record.model;
      write(record);
      return { ok: true, record };
    },
  };
}
