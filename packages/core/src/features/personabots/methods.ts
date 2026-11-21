import {
  createOnboardingBridgeMethods,
  type OnboardingBridgeMethods,
} from './onboarding-methods.js';
import { createRosterBridgeMethods, type RosterBridgeMethods } from './roster-methods.js';
import { createModelRoutingHelpers } from '../models/routing.js';
import {
  asObject,
  parseOptional,
  parseRoles,
  parseStringArray,
  type ParsedField,
  asSlug,
  invalidInput,
  unavailable,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { modelFailure } from '../../models/provider-bridge.js';
import type { OrchestratorRunner } from '@botharness/host-protocol/wire';

import { botOwner } from '../../team/bot-access.js';

import { type HumanContext } from '../../humans/context.js';
import { createBotImports, type BotImportsService } from '../../bots/imports.js';
import { isDeepStrictEqual } from 'node:util';
import { DEEPSEEKBOT_RECIPE } from '../../onboarding/service.js';
import { botProfileFingerprint } from '../../bots/profile-snapshot.js';
import {
  BotCreationError,
  type BotCreationInput,
  type BotCreationReceipt,
} from '../../bots/creation.js';

import type { HttpsFallback } from '../../memory/clone.js';
import {
  MAX_DESCRIPTOR_BIO_LENGTH,
  MAX_DESCRIPTOR_TAG_LENGTH,
  MAX_DESCRIPTOR_TAGS,
} from '../../marketplace/descriptor.js';

import { botAvatarUrl } from '../../bots/avatar-http.js';
import { botBannerSummary } from '../../bots/banner-http.js';
import { currentBotPrimaryColor, historicalBotPrimaryColor } from '../../bots/primary-color.js';
import type {
  CreatePersonaBotResult,
  PersonaBotPatch,
  PersonaBotRecord,
} from '../../bots/persona-bot.js';
import type { PersonaBotDeletionPreview, PersonaBotDeletion } from '../../bots/deletion.js';

import {
  DEFAULT_STANDING_LIMITS,
  isStandingLimits,
  MAX_STANDING_LIMIT,
  MIN_STANDING_LIMIT,
} from '../../memory/soul.js';
import type { BotStateSnapshot } from '../../state/bot-state.js';
import type {
  BridgeMethodsDeps,
  PersonaBotSummary,
  PersonaBotDetail,
  SharedBotSummary,
} from '../../bridge/methods.js';
function asQuery(payload: unknown): string | undefined {
  const value = asObject(payload)['query'];
  return typeof value === 'string' ? value : undefined;
}

function parseCreation(
  payload: unknown,
): BridgeResult<{ input: BotCreationInput; operationKey?: string }> {
  const source = asObject(payload);
  const displayName = source['displayName'];
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    return invalidInput('displayName is required');
  }
  const persona = parseOptional(source, 'persona');
  const coreMemory = parseOptional(source, 'coreMemory');
  const roles = parseRoles(source);
  const description = parseOptional(source, 'description');
  const model = parseOptional(source, 'model');
  const preset = parseOptional(source, 'preset');
  const workspaces = parseWorkspaces(source);
  const avatar = parseOptional(source, 'avatar');
  const memoryLocation = parseOptional(source, 'memoryLocation');
  if (
    !memoryLocation.ok ||
    !persona.ok ||
    !coreMemory.ok ||
    !roles.ok ||
    !description.ok ||
    !model.ok ||
    !preset.ok ||
    !workspaces.ok ||
    !avatar.ok
  ) {
    return invalidInput('invalid create payload');
  }
  const operationKey = source['operationKey'];
  if (operationKey !== undefined && typeof operationKey !== 'string')
    return invalidInput('operationKey must be a string');
  const input = {
    displayName,
    ...(persona.value === undefined ? {} : { persona: persona.value }),
    ...(coreMemory.value === undefined ? {} : { coreMemory: coreMemory.value }),
    ...(roles.value === undefined ? {} : { roles: roles.value }),
    ...(description.value === undefined ? {} : { description: description.value }),
    ...(model.value === undefined ? {} : { model: model.value }),
    ...(preset.value === undefined ? {} : { preset: preset.value }),
    ...(workspaces.value === undefined ? {} : { workspaces: workspaces.value }),
    ...(avatar.value === undefined ? {} : { avatar: avatar.value }),
    ...(memoryLocation.value === undefined ? {} : { memoryLocation: memoryLocation.value }),
  };
  return {
    ok: true,
    value: { input, ...(operationKey === undefined ? {} : { operationKey }) },
  };
}

const parseWorkspaces = (source: Record<string, unknown>): ParsedField<string[]> =>
  parseStringArray(source, 'workspaces');

function createFailure(
  slug: string,
  failure: Extract<CreatePersonaBotResult, { ok: false }>,
): BridgeResult<never> {
  switch (failure.reason) {
    case 'duplicate':
      return {
        ok: false,
        error: {
          code: 'duplicate',
          message: `PersonaBot already exists: ${slug}`,
        },
      };
    case 'invalid-slug':
      return {
        ok: false,
        error: { code: 'invalid-slug', message: `invalid slug: ${slug}` },
      };
    case 'invalid-input':
      return invalidInput('invalid PersonaBot input');
    case 'invalid-memory-dir':
      return {
        ok: false,
        error: {
          code: 'invalid-memory-dir',
          message:
            'The Memory location must be an existing absolute folder that does not already hold this Bot.',
        },
      };
    case 'git-not-found':
      return {
        ok: false,
        error: {
          code: 'git-not-found',
          message: 'Install Git, make it available on PATH, restart DeepSeek Harness, then retry.',
        },
      };
    case 'invalid-git-url':
      return {
        ok: false,
        error: {
          code: 'invalid-git-url',
          message: 'Enter an HTTPS or SSH Git URL without credentials.',
        },
      };
    case 'git-source-changed':
      return {
        ok: false,
        error: {
          code: 'git-source-changed',
          message:
            'The repository changed after inspection. Review the source again before starting another import.',
        },
      };
    case 'git-clone-failed':
      return {
        ok: false,
        error: {
          code: 'git-clone-failed',
          message: 'Git clone failed. Check the URL and Host Git credentials.',
        },
      };
    case 'git-clone-timeout':
      return {
        ok: false,
        error: {
          code: 'git-clone-timeout',
          message: 'Git clone timed out. Retry or check Host network access.',
        },
      };
    case 'invalid-zip':
      return {
        ok: false,
        error: {
          code: 'invalid-zip',
          message: 'The zip file could not be unpacked.',
        },
      };
    case 'memory-unavailable':
      return {
        ok: false,
        error: {
          code: 'memory-unavailable',
          message: `Memory Repository is unavailable: ${failure.detail ?? 'unknown reason'}`,
        },
      };
  }
}

function summarize(
  record: PersonaBotRecord,
  snapshot: BotStateSnapshot,
  protectedTob = false,
): PersonaBotSummary {
  return {
    slug: record.slug,
    displayName: record.displayName,
    ...(protectedTob
      ? {
          tob: {
            defaultName: record.displayNameCustomized !== true && record.displayName === 'Tob',
            defaultAvatar:
              record.avatarCustomized !== true &&
              ((!record.avatar?.trim() && record.appearance === undefined) ||
                isDeepStrictEqual(record.appearance?.recipe, DEEPSEEKBOT_RECIPE)),
          },
        }
      : {}),
    aggregateState: snapshot.state,
    workspaces: [...record.workspaces],
    createdAt: record.createdAt,
    roles: record.roles ?? (record.tag === undefined ? [] : [record.tag]),
    standingLimits: { ...(record.standingLimits ?? DEFAULT_STANDING_LIMITS) },
    ...(record.appearance === undefined ? {} : { appearance: record.appearance }),
    ...(currentBotPrimaryColor(record.primaryColor) === undefined
      ? {}
      : { primaryColor: currentBotPrimaryColor(record.primaryColor)! }),
    ...(record.description === undefined ? {} : { description: record.description }),
    ...(record.avatar === undefined
      ? {}
      : {
          avatar: record.avatar.startsWith('data:image/')
            ? botAvatarUrl(record.slug, record.avatar)
            : record.avatar,
        }),
    ...(record.banner === undefined
      ? {}
      : { banner: botBannerSummary(record.slug, record.banner) }),
    ...(record.avatarSeed === undefined ? {} : { avatarSeed: record.avatarSeed }),
    ...(record.paused === undefined ? {} : { paused: record.paused }),
    ...(record.computerAccess === undefined ? {} : { computerAccess: record.computerAccess }),
    ...(record.browserAccess === undefined ? {} : { browserAccess: record.browserAccess }),
    ...(record.browserProfile === undefined ? {} : { browserProfile: record.browserProfile }),
    ...(record.approvalTemplate === undefined ? {} : { approvalTemplate: record.approvalTemplate }),
    ...(record.marketplaceUpload === undefined
      ? {}
      : { uploadedListing: record.marketplaceUpload.id }),
    ...(record.marketplaceListing === undefined
      ? {}
      : { installedListing: record.marketplaceListing.id }),
  };
}

export function detail(
  record: PersonaBotRecord,
  snapshot: BotStateSnapshot,
  protectedTob = false,
): PersonaBotDetail {
  return {
    ...summarize(record, snapshot, protectedTob),
    sessions: { ...snapshot.sessions },
    ...(record.model === undefined ? {} : { model: record.model }),
    ...(record.modelPlan === undefined ? {} : { modelPlan: record.modelPlan }),
    ...(record.preset === undefined ? {} : { preset: record.preset }),
    ...(record.memoryDir === undefined ? {} : { memoryDir: record.memoryDir }),
  };
}

export interface PersonaBotsBridgeMethods extends RosterBridgeMethods, OnboardingBridgeMethods {
  list(payload: unknown): BridgeResult<{ bots: Array<PersonaBotSummary | SharedBotSummary> }>;
  get(payload: unknown): BridgeResult<{ bot: PersonaBotDetail; profileFingerprint: string }>;
  create(payload: unknown): BridgeResult<{
    bot: PersonaBotDetail;
    channelId?: string;
    receipt?: BotCreationReceipt;
  }>;
  botImportPreview(
    payload: unknown,
  ): Promise<BridgeResult<Awaited<ReturnType<BotImportsService['previewGit']>>>>;
  botImportLookup(payload: unknown): BridgeResult<{ receipt: BotCreationReceipt | null }>;
  createLookup(payload: unknown): BridgeResult<{ receipt: BotCreationReceipt | null }>;
  createFromGit(payload: unknown): Promise<
    BridgeResult<{
      bot: PersonaBotDetail;
      httpsFallback?: HttpsFallback;
      receipt?: BotCreationReceipt;
      channelId?: string;
    }>
  >;
  update(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  deletionPreview(payload: unknown): BridgeResult<{ preview: PersonaBotDeletionPreview }>;
  deletionConfirm(payload: unknown): Promise<BridgeResult<{ deletion: PersonaBotDeletion }>>;
  deletionRetry(payload: unknown): Promise<BridgeResult<{ deletion: PersonaBotDeletion }>>;
  deletionMemoryFolder(payload: unknown): BridgeResult<{
    target: { path: string; relativePath: string; kind: 'directory' };
  }>;
  pause(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  resume(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;

  standingLimitsSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
}

export function createPersonaBotsBridgeMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  isHostOwner: () => boolean,
  runnerOf: (slug: string) => { orchestratorRunner?: OrchestratorRunner },
  allowed: (record: PersonaBotRecord) => boolean,
  requireOwnedBot: (slug: string) => void,
  detailOf: (record: PersonaBotRecord) => { bot: PersonaBotDetail },
  createBotId: () => string,
  sendReceipt: (listingId: string) => void,
  modelRouting: ReturnType<typeof createModelRoutingHelpers>,
): PersonaBotsBridgeMethods {
  const setPaused = (
    payload: unknown,
    paused: boolean,
  ): BridgeResult<{ bot: PersonaBotDetail }> => {
    const slug = asSlug(payload);
    if (slug === undefined) return invalidInput('slug is required');
    if (paused && deps.tob?.isTob(slug))
      return {
        ok: false,
        error: { code: 'protected-bot', message: 'Tob cannot be archived' },
      };
    const result = deps.registry.setPaused(slug, paused);
    if (!result.ok) return unknownBot(slug);
    if (paused) deps.channels.cancelInvitationsForBot(slug);
    else deps.runtime?.resumePendingDigests?.(slug);
    return { ok: true, value: detailOf(result.record) };
  };
  const onboardingMethods = createOnboardingBridgeMethods(human, deps, isHostOwner, modelRouting);
  const rosterMethods = createRosterBridgeMethods(human, deps);
  return {
    onboarding: onboardingMethods.onboarding,
    onboardingModel: onboardingMethods.onboardingModel,
    deletionPreview(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.deletions === undefined) return unavailable();
      try {
        if (deps.tob?.isTob(slug))
          return {
            ok: false,
            error: { code: 'protected-bot', message: 'Tob cannot be deleted' },
          };
        return { ok: true, value: { preview: deps.deletions.preview(slug) } };
      } catch (error) {
        return invalidInput(
          error instanceof Error ? error.message : 'Deletion preview unavailable',
        );
      }
    },
    async deletionConfirm(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      if (
        slug === undefined ||
        typeof source['token'] !== 'string' ||
        typeof source['eraseMemory'] !== 'boolean'
      )
        return invalidInput('Explicit deletion scope is required');
      if (deps.deletions === undefined) return unavailable();
      try {
        if (deps.tob?.isTob(slug))
          return {
            ok: false,
            error: { code: 'protected-bot', message: 'Tob cannot be deleted' },
          };
        const result = deps.deletions.confirm(slug, source['token'], source['eraseMemory']);
        deps.computerAccess?.changed(slug);
        deps.browserAccess?.changed(slug);
        return { ok: true, value: { deletion: await result } };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : 'Deletion unavailable');
      }
    },
    async deletionRetry(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.deletions === undefined) return unavailable();
      try {
        return {
          ok: true,
          value: { deletion: await deps.deletions.retry(slug) },
        };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : 'Deletion retry unavailable');
      }
    },
    deletionMemoryFolder(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.deletions === undefined) return unavailable();
      try {
        return { ok: true, value: { target: deps.deletions.folder(slug) } };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : 'Memory folder unavailable');
      }
    },
    list(payload) {
      const activity = new Map(deps.channels.latestBotActivity?.(human));
      for (const [slug, at] of deps.runtime?.latestAssignmentActivity?.() ?? [])
        activity.set(slug, Math.max(activity.get(slug) ?? 0, at));
      const query = asQuery(payload)?.trim().toLowerCase();
      const bots = deps.registry
        .listHistorical()
        .filter((record) => {
          if (query === undefined || query.length === 0) return true;
          const roles = record.roles ?? (record.tag === undefined ? [] : [record.tag]);
          return (
            record.displayName.toLowerCase().includes(query) ||
            roles.some((role) => role.toLowerCase().includes(query))
          );
        })
        .map((record) => ({
          ...summarize(record, deps.states.snapshot(record.slug), deps.tob?.isTob(record.slug)),
          ...runnerOf(record.slug),
          ...(deps.team ? { modelAllowed: allowed(record) } : {}),
          ownerHumanId: botOwner(record),
          owner: botOwner(record) === human.humanId,
          ...(botOwner(record) === human.humanId && activity.has(record.slug)
            ? { lastActivityAt: activity.get(record.slug)! }
            : {}),
          ...(deps.registry.get(record.slug) === undefined
            ? {
                deleted: true,
                paused: true,
                primaryColor: historicalBotPrimaryColor(record.slug, record.primaryColor),
              }
            : {}),
        }));
      const shared =
        deps.team?.bots
          .sharedRoster(human)
          .filter(
            (bot) =>
              !query ||
              bot.displayName.toLowerCase().includes(query) ||
              bot.slug.toLowerCase().includes(query),
          )
          .map((bot) => ({ ...bot, ...runnerOf(bot.slug) })) ?? [];
      return { ok: true, value: { bots: [...bots, ...shared] } };
    },
    get(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) {
        return invalidInput('slug is required');
      }
      const record = deps.registry.get(slug);
      if (record === undefined) return unknownBot(slug);
      try {
        requireOwnedBot(slug);
      } catch (error) {
        return modelFailure(error);
      }
      const bot = detailOf(record).bot;
      const memoryDir = deps.registry.memoryDirFor(slug);
      return {
        ok: true,
        value: {
          bot: {
            ...bot,
            ...(deps.team ? { modelAllowed: allowed(record) } : {}),
            ...(memoryDir === undefined ? {} : { memoryDir }),
          },
          profileFingerprint: botProfileFingerprint(record),
        },
      };
    },
    create(payload) {
      const parsed = parseCreation(payload);
      if (!parsed.ok) return parsed;
      const { input, operationKey } = parsed.value;
      if (deps.creations !== undefined) {
        try {
          const created = deps.creations.create(input, operationKey);
          return {
            ok: true,
            value: {
              ...detailOf(created.record),
              channelId: created.channelId,
              ...(created.receipt === undefined ? {} : { receipt: created.receipt }),
            },
          };
        } catch (error) {
          if (error instanceof BotCreationError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (operationKey !== undefined)
        return {
          ok: false,
          error: {
            code: 'creation-unavailable',
            message: 'Idempotent creation is unavailable on this Host.',
          },
        };
      const slug = createBotId();
      const result = deps.registry.create({ ...input, slug });
      if (!result.ok) return createFailure(slug, result);
      return { ok: true, value: detailOf(result.record) };
    },
    createLookup(payload) {
      const parsed = parseCreation(payload);
      if (!parsed.ok) return parsed;
      const { input, operationKey } = parsed.value;
      if (operationKey === undefined) return invalidInput('operationKey is required');
      if (deps.creations === undefined)
        return {
          ok: false,
          error: {
            code: 'creation-unavailable',
            message: 'Idempotent creation is unavailable on this Host.',
          },
        };
      try {
        return {
          ok: true,
          value: {
            receipt: deps.creations.lookup(operationKey, input) ?? null,
          },
        };
      } catch (error) {
        if (error instanceof BotCreationError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        throw error;
      }
    },
    botImportLookup(payload) {
      const source = asObject(payload);
      const displayName = source['displayName'];
      const gitUrl = source['gitUrl'];
      const expectedCommit = source['expectedCommit'];
      const operationKey = source['operationKey'];
      const roles = parseRoles(source);
      const description = parseOptional(source, 'description');
      if (
        typeof displayName !== 'string' ||
        !displayName.trim() ||
        typeof gitUrl !== 'string' ||
        typeof expectedCommit !== 'string' ||
        typeof operationKey !== 'string' ||
        !roles.ok ||
        !description.ok
      )
        return invalidInput('Stable Git lookup needs its complete original input');
      const imports =
        deps.imports ??
        (deps.creations
          ? createBotImports(deps.creations, deps.warn === undefined ? {} : { log: deps.warn })
          : undefined);
      if (!imports)
        return {
          ok: false,
          error: {
            code: 'creation-unavailable',
            message: 'Import recovery is unavailable on this Host.',
          },
        };
      try {
        const input = imports.gitInput({
          displayName,
          gitUrl,
          expectedCommit,
          ...(roles.value === undefined ? {} : { roles: roles.value }),
          ...(description.value === undefined ? {} : { description: description.value }),
        });
        return {
          ok: true,
          value: { receipt: imports.lookup(operationKey, input) ?? null },
        };
      } catch (error) {
        if (error instanceof BotCreationError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        throw error;
      }
    },
    async botImportPreview(payload) {
      const gitUrl = asObject(payload)['gitUrl'];
      if (typeof gitUrl !== 'string') return invalidInput('gitUrl is required');
      const imports =
        deps.imports ??
        (deps.creations
          ? createBotImports(deps.creations, deps.warn === undefined ? {} : { log: deps.warn })
          : undefined);
      if (!imports) return unavailable();
      try {
        return { ok: true, value: await imports.previewGit(gitUrl) };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof BotCreationError ? error.code : 'import-unavailable',
            message: 'The selected source could not be inspected.',
          },
        };
      }
    },
    async createFromGit(payload) {
      const source = asObject(payload);
      const displayName = source['displayName'];
      const gitUrl = source['gitUrl'];
      if (typeof displayName !== 'string' || displayName.trim().length === 0) {
        return invalidInput('displayName is required');
      }
      if (typeof gitUrl !== 'string' || gitUrl.trim().length === 0) {
        return invalidInput('gitUrl is required');
      }
      const roles = parseRoles(source);
      const description = parseOptional(source, 'description');
      if (!roles.ok || !description.ok) return invalidInput('invalid create payload');
      const listingId = source['listingId'];
      if (
        listingId !== undefined &&
        (typeof listingId !== 'string' ||
          listingId.trim().length === 0 ||
          source['origin'] !== 'marketplace')
      )
        return invalidInput('listingId needs origin marketplace');
      if (source['operationKey'] !== undefined) {
        const imports =
          deps.imports ??
          (deps.creations
            ? createBotImports(deps.creations, deps.warn === undefined ? {} : { log: deps.warn })
            : undefined);
        if (
          !imports ||
          typeof source['operationKey'] !== 'string' ||
          typeof source['expectedCommit'] !== 'string'
        )
          return invalidInput('Stable Git import needs operationKey and expectedCommit');
        try {
          const input = imports.gitInput({
            gitUrl,
            expectedCommit: source['expectedCommit'],
            displayName,
            ...(roles.value === undefined ? {} : { roles: roles.value }),
            ...(description.value === undefined ? {} : { description: description.value }),
          });
          const created = await imports.create(source['operationKey'], input);
          if (listingId !== undefined) sendReceipt(listingId.trim());
          return {
            ok: true,
            value: {
              ...detailOf(created.record),
              receipt: created.receipt!,
              channelId: created.channelId,
              source: input.source,
              ...(created.httpsFallback === undefined
                ? {}
                : { httpsFallback: created.httpsFallback }),
            },
          };
        } catch (error) {
          if (error instanceof BotCreationError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      const slug = createBotId();
      const result = await deps.registry.createFromGit({
        slug,
        displayName,
        gitUrl,
        ...(typeof source['expectedCommit'] === 'string'
          ? { expectedCommit: source['expectedCommit'] }
          : {}),
        ...(roles.value === undefined ? {} : { roles: roles.value }),
        ...(description.value === undefined ? {} : { description: description.value }),
      });
      if (!result.ok) return createFailure(slug, result);
      if (listingId !== undefined) sendReceipt(listingId.trim());
      if (source['origin'] === 'marketplace') {
        try {
          deps.telemetry?.capture?.('marketplace:bot_install');
        } catch {}
      }
      return {
        ok: true,
        value: {
          ...detailOf(result.record),
          ...(result.httpsFallback === undefined ? {} : { httpsFallback: result.httpsFallback }),
        },
      };
    },
    update(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const patchOrUndefined = asObject(payload)['patch'];
      if (typeof patchOrUndefined !== 'object' || patchOrUndefined === null) {
        return invalidInput('patch is required');
      }
      const source = patchOrUndefined as Record<string, unknown>;
      const displayName = parseOptional(source, 'displayName');
      const roles = parseRoles(source);
      const description = parseOptional(source, 'description');
      const model = parseOptional(source, 'model');
      const preset = parseOptional(source, 'preset');
      const workspaces = parseWorkspaces(source);
      const avatar = parseOptional(source, 'avatar');
      if (
        !displayName.ok ||
        !roles.ok ||
        !description.ok ||
        !model.ok ||
        !preset.ok ||
        !workspaces.ok ||
        !avatar.ok
      ) {
        return invalidInput('invalid update payload');
      }
      if (
        (roles.value !== undefined &&
          (roles.value.length > MAX_DESCRIPTOR_TAGS ||
            roles.value.some((tag) => [...tag.trim()].length > MAX_DESCRIPTOR_TAG_LENGTH))) ||
        (description.value !== undefined &&
          [...description.value.trim()].length > MAX_DESCRIPTOR_BIO_LENGTH)
      ) {
        return invalidInput('tags or bio exceed the profile limits');
      }
      const patch: PersonaBotPatch = {
        ...(displayName.value === undefined ? {} : { displayName: displayName.value }),
        ...(roles.value === undefined ? {} : { roles: roles.value }),
        ...(description.value === undefined ? {} : { description: description.value }),
        ...(model.value === undefined ? {} : { model: model.value }),
        ...(preset.value === undefined ? {} : { preset: preset.value }),
        ...(workspaces.value === undefined ? {} : { workspaces: workspaces.value }),
        ...(avatar.value === undefined ? {} : { avatar: avatar.value }),
      };
      const presetSettingsError =
        preset.value !== undefined && preset.value.trim().length > 0
          ? deps.botModes?.settings.readError()
          : undefined;
      if (presetSettingsError !== undefined)
        return {
          ok: false,
          error: { code: 'settings-unreadable', message: presetSettingsError },
        };
      const allowedModes = deps.botModes?.settings.allowedModes(slug);
      if (
        preset.value !== undefined &&
        preset.value.trim().length > 0 &&
        allowedModes !== undefined &&
        !allowedModes.includes(preset.value.trim())
      )
        return {
          ok: false,
          error: {
            code: 'mode-not-allowed',
            message: `Mode ${preset.value.trim()} is not in this Bot's mode template; choose one of ${allowedModes.join(', ')} or change the template.`,
          },
        };
      const expectedProfile = asObject(payload)['expectedProfile'];
      if (expectedProfile !== undefined) {
        if (typeof expectedProfile !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedProfile))
          return invalidInput('expectedProfile must be an observed profile fingerprint');
        const current = deps.registry.get(slug);
        if (!current) return unknownBot(slug);
        if (botProfileFingerprint(current) !== expectedProfile)
          return {
            ok: false,
            error: {
              code: 'stale-profile',
              message: 'The Bot profile changed. Read it again before applying this update.',
            },
          };
      }
      const result = deps.registry.update(slug, patch);
      if (!result.ok) {
        return result.reason === 'not-found'
          ? unknownBot(slug)
          : invalidInput('invalid update payload');
      }
      return { ok: true, value: detailOf(result.record) };
    },
    pause(payload) {
      return setPaused(payload, true);
    },
    resume(payload) {
      return setPaused(payload, false);
    },
    standingLimitsSet(payload) {
      const slug = asSlug(payload);
      const object = asObject(payload);
      const limits = { soul: object['soul'], coreMemory: object['coreMemory'] };
      if (slug === undefined || !isStandingLimits(limits)) {
        return invalidInput(
          `slug, soul and coreMemory are required; limits are whole numbers from ${MIN_STANDING_LIMIT} to ${MAX_STANDING_LIMIT}`,
        );
      }
      const result = deps.registry.setStandingLimits(slug, limits);
      if (!result.ok) return unknownBot(slug);
      return { ok: true, value: detailOf(result.record) };
    },
    rosterGet: rosterMethods.rosterGet,
    sectionCreate: rosterMethods.sectionCreate,
    sectionRename: rosterMethods.sectionRename,
    sectionRemove: rosterMethods.sectionRemove,
    channelAssign: rosterMethods.channelAssign,
    sectionReorder: rosterMethods.sectionReorder,
    topReorder: rosterMethods.topReorder,
    pinsSet: rosterMethods.pinsSet,
    hiddenSet: rosterMethods.hiddenSet,
    channelMuteSet: rosterMethods.channelMuteSet,
    rosterBatch: rosterMethods.rosterBatch,
  };
}
