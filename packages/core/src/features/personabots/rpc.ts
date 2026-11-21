import { unwrap, unwrapAsync, type AdminResult } from '../../bridge/rpc-result.js';
import type {
  BotMetadata,
  BotMetadataResult,
  AdminDeletionPreview,
  AdminDeletion,
} from '../../team/bot-administration.js';
import type { BotImportsService } from '../../bots/imports.js';
import type { BotCreationReceipt } from '../../bots/creation.js';
import type { OnboardingSnapshot, TutorialAction } from '../../onboarding/service.js';
import type { HttpsFallback } from '../../memory/clone.js';
import type { PersonaBotDeletionPreview, PersonaBotDeletion } from '../../bots/deletion.js';
import type { PersonaBotPatch } from '../../bots/persona-bot.js';
import type { ModelRoute } from '../../models/presets.js';
import type {
  PersonaBotDetail,
  PersonaBotSummary,
  SharedBotSummary,
} from '../../bridge/methods.js';
import type { RosterSection, RosterSnapshot } from '../../roster/store.js';
import type { TopOrderEntry } from '../../roster/spec.js';
import type { PersonaBotsBridgeMethods } from './methods.js';

export function onboarding(
  methods: PersonaBotsBridgeMethods,
  slug?: string,
  action?: TutorialAction,
): Promise<OnboardingSnapshot> {
  return unwrapAsync(methods.onboarding({ slug, action }));
}

export function onboardingModel(
  methods: PersonaBotsBridgeMethods,
  slug: string | undefined,
  expectedRevision: number,
  route: ModelRoute | undefined,
  globalDefault: boolean,
  expectedDefaultRevision?: number,
  groupId?: string,
  groupEffort?: string,
  expectedDefaultGroupRevision?: number,
): Promise<{ revision: number; groupRevision?: number }> {
  return unwrapAsync(
    methods.onboardingModel({
      slug,
      expectedRevision,
      ...(route === undefined ? {} : { route }),
      globalDefault,
      expectedDefaultRevision,
      ...(groupId === undefined ? {} : { groupId }),
      ...(groupEffort === undefined ? {} : { groupEffort }),
      ...(expectedDefaultGroupRevision === undefined ? {} : { expectedDefaultGroupRevision }),
    }),
  );
}

export function list(
  methods: PersonaBotsBridgeMethods,
  query?: string,
  administration?: boolean,
): { bots: Array<PersonaBotSummary | SharedBotSummary | BotMetadata> } {
  return unwrap(
    methods.list({ query, ...(administration === undefined ? {} : { administration }) }),
  );
}

export function get(
  methods: PersonaBotsBridgeMethods,
  slug: string,
): AdminResult<{ bot: PersonaBotDetail; profileFingerprint: string }> {
  return unwrap(methods.get({ slug }));
}

export function create(
  methods: PersonaBotsBridgeMethods,
  displayName: string,
  roles?: string[],
  persona?: string,
  description?: string,
  model?: string,
  preset?: string,
  workspaces?: string[],
  avatar?: string,
  memoryLocation?: string,
  coreMemory?: string,
  operationKey?: string,
): {
  bot: PersonaBotDetail;
  channelId?: string;
  receipt?: BotCreationReceipt;
} {
  return unwrap(
    methods.create({
      displayName,
      roles,
      persona,
      description,
      model,
      preset,
      workspaces,
      avatar,
      memoryLocation,
      coreMemory,
      operationKey,
    }),
  );
}

export function createLookup(
  methods: PersonaBotsBridgeMethods,
  operationKey: string,
  displayName: string,
  roles?: string[],
  persona?: string,
  description?: string,
  model?: string,
  preset?: string,
  workspaces?: string[],
  avatar?: string,
  memoryLocation?: string,
  coreMemory?: string,
): { receipt: BotCreationReceipt | null } {
  return unwrap(
    methods.createLookup({
      displayName,
      roles,
      persona,
      description,
      model,
      preset,
      workspaces,
      avatar,
      memoryLocation,
      coreMemory,
      operationKey,
    }),
  );
}

export function botImportPreview(
  methods: PersonaBotsBridgeMethods,
  gitUrl: string,
): Promise<Awaited<ReturnType<BotImportsService['previewGit']>>> {
  return unwrapAsync(methods.botImportPreview({ gitUrl }));
}

export function botImportLookup(
  methods: PersonaBotsBridgeMethods,
  operationKey: string,
  gitUrl: string,
  expectedCommit: string,
  displayName: string,
  roles?: string[],
  description?: string,
): { receipt: BotCreationReceipt | null } {
  return unwrap(
    methods.botImportLookup({
      operationKey,
      gitUrl,
      expectedCommit,
      displayName,
      roles,
      description,
    }),
  );
}

export function createFromGit(
  methods: PersonaBotsBridgeMethods,
  displayName: string,
  gitUrl: string,
  roles?: string[],
  description?: string,
  origin?: 'marketplace',
  operationKey?: string,
  expectedCommit?: string,
  listingId?: string,
): Promise<{
  bot: PersonaBotDetail;
  httpsFallback?: HttpsFallback;
  receipt?: BotCreationReceipt;
  channelId?: string;
}> {
  return unwrapAsync(
    methods.createFromGit({
      displayName,
      gitUrl,
      roles,
      description,
      origin,
      operationKey,
      expectedCommit,
      listingId,
    }),
  );
}

export function update(
  methods: PersonaBotsBridgeMethods,
  slug: string,
  patch: PersonaBotPatch,
  expectedProfile?: string,
): AdminResult<{ bot: PersonaBotDetail }> {
  return unwrap(methods.update({ slug, patch, expectedProfile }));
}

export function deletionPreview(
  methods: PersonaBotsBridgeMethods,
  slug: string,
): AdminResult<
  { preview: PersonaBotDeletionPreview },
  BotMetadataResult & { preview: AdminDeletionPreview }
> {
  return unwrap(methods.deletionPreview({ slug }));
}

export function deletionConfirm(
  methods: PersonaBotsBridgeMethods,
  slug: string,
  token: string,
  eraseMemory: boolean,
): Promise<
  AdminResult<{ deletion: PersonaBotDeletion }, BotMetadataResult & { deletion: AdminDeletion }>
> {
  return unwrapAsync(methods.deletionConfirm({ slug, token, eraseMemory }));
}

export function deletionRetry(
  methods: PersonaBotsBridgeMethods,
  slug: string,
): Promise<
  AdminResult<{ deletion: PersonaBotDeletion }, BotMetadataResult & { deletion: AdminDeletion }>
> {
  return unwrapAsync(methods.deletionRetry({ slug }));
}

export function deletionMemoryFolder(
  methods: PersonaBotsBridgeMethods,
  slug: string,
): AdminResult<{
  target: { path: string; relativePath: string; kind: 'directory' };
}> {
  return unwrap(methods.deletionMemoryFolder({ slug }));
}

export function pause(
  methods: PersonaBotsBridgeMethods,
  slug: string,
): AdminResult<{ bot: PersonaBotDetail }> {
  return unwrap(methods.pause({ slug }));
}

export function resume(
  methods: PersonaBotsBridgeMethods,
  slug: string,
): AdminResult<{ bot: PersonaBotDetail }> {
  return unwrap(methods.resume({ slug }));
}

export function standingLimitsSet(
  methods: PersonaBotsBridgeMethods,
  slug: string,
  soul: number,
  coreMemory: number,
): AdminResult<{ bot: PersonaBotDetail }> {
  return unwrap(methods.standingLimitsSet({ slug, soul, coreMemory }));
}

export function rosterGet(methods: PersonaBotsBridgeMethods): RosterSnapshot {
  return unwrap(methods.rosterGet({}));
}

export function sectionCreate(
  methods: PersonaBotsBridgeMethods,
  name: string,
): Promise<{ section: RosterSection }> {
  return unwrapAsync(methods.sectionCreate({ name }));
}

export function sectionRename(
  methods: PersonaBotsBridgeMethods,
  sectionId: string,
  name: string,
): Promise<{ section: RosterSection }> {
  return unwrapAsync(methods.sectionRename({ sectionId, name }));
}

export function sectionRemove(
  methods: PersonaBotsBridgeMethods,
  sectionId: string,
): Promise<{ removed: boolean }> {
  return unwrapAsync(methods.sectionRemove({ sectionId }));
}

export function channelAssign(
  methods: PersonaBotsBridgeMethods,
  channelId: string,
  sectionId?: string | null,
  index?: number,
): Promise<Record<string, never>> {
  return unwrapAsync(methods.channelAssign({ channelId, sectionId, index }));
}

export function sectionReorder(
  methods: PersonaBotsBridgeMethods,
  order: string[],
): Promise<{ sectionOrder: string[] }> {
  return unwrapAsync(methods.sectionReorder({ order }));
}

export function topReorder(
  methods: PersonaBotsBridgeMethods,
  order: TopOrderEntry[],
): Promise<{ topOrder: TopOrderEntry[] }> {
  return unwrapAsync(methods.topReorder({ order }));
}

export function pinsSet(
  methods: PersonaBotsBridgeMethods,
  pins: string[],
): Promise<{ pins: string[] }> {
  return unwrapAsync(methods.pinsSet({ pins }));
}

export function hiddenSet(
  methods: PersonaBotsBridgeMethods,
  hidden: string[],
): Promise<{ hidden: string[] }> {
  return unwrapAsync(methods.hiddenSet({ hidden }));
}

export function channelMuteSet(
  methods: PersonaBotsBridgeMethods,
  channelId: string,
  muted: boolean,
): Promise<{ muted: string[] }> {
  return unwrapAsync(methods.channelMuteSet({ channelId, muted }));
}

export function rosterBatch(
  methods: PersonaBotsBridgeMethods,
  action: 'pin' | 'unpin' | 'hide' | 'move',
  channelIds: string[],
  sectionId?: string | null,
): Promise<RosterSnapshot> {
  return unwrapAsync(methods.rosterBatch({ action, channelIds, sectionId }));
}
