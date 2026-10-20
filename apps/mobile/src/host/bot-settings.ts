import { MethodRefused, type HostClient } from './client';

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'failed'; error: string };

export interface ModelRoute {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export interface AssignmentModelOption {
  provider: string;
  model: string;
  allowedEfforts: string[];
  defaultEffort: string;
  note?: string;
}

export interface ModelCatalogEntry {
  provider: string;
  providerName: string;
  model: string;
  modelName: string;
  efforts?: { id: string; name: string }[];
  defaultEffort?: string;
  credential?: 'missing' | 'invalid';
}

export interface ModelPlan {
  revision: number;
  sourcePresetId: string;
  sourcePresetName: string;
  orchestrator: ModelRoute;
  assignmentDefault?: ModelRoute;
  assignmentModels?: AssignmentModelOption[];
}

export interface ModelPreset {
  id: string;
  name: string;
  revision?: number;
  orchestrator: ModelRoute;
  assignmentDefault?: ModelRoute;
  assignmentModels?: AssignmentModelOption[];
}

export interface BotModel {
  revision: number;
  plan?: ModelPlan;
  repair?: string;
  models: ModelCatalogEntry[];
  fallback?: ModelRoute;
  presets: ModelPreset[];
}

export interface WorkspaceGrant {
  id: string;
  workspaceId: string;
  workspacePath: string;
  workspaceTitle: string;
  orchestratorWrite: boolean;
  revokedAt?: string;
}

export interface WorkspaceOption {
  id: string;
  path: string;
  title: string;
}

export interface HostFolder {
  name: string;
  path: string;
  hidden: boolean;
}

export interface HostFolderListing {
  path: string;
  crumbs: HostFolder[];
  entries: HostFolder[];
  truncated: boolean;
}

export type AccessMode = 'workspace-write' | 'danger-full-access';
export type AccessScope = 'chat' | 'assignments';

export interface AssignmentAccess {
  mode: AccessMode;
  scope: AccessScope;
  revision: number;
}

export interface ApprovalTemplate {
  name: string;
  title: string;
  description: string;
}

export interface ApprovalTemplates {
  templates: ApprovalTemplate[];
  selected: string | null;
}

export class HostAnswerInvalid extends Error {}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): value is string {
  return typeof value === 'string';
}

function route(value: unknown): ModelRoute | undefined {
  const row = record(value);
  if (!text(row?.['provider']) || !text(row['model'])) return undefined;
  return {
    provider: row['provider'],
    model: row['model'],
    ...(text(row['reasoningEffort']) ? { reasoningEffort: row['reasoningEffort'] } : {}),
  };
}

function plan(value: unknown): ModelPlan | undefined {
  const row = record(value);
  const orchestrator = route(row?.['orchestrator']);
  const assignmentDefault = route(row?.['assignmentDefault']);
  if (
    row === undefined ||
    orchestrator === undefined ||
    (row['assignmentDefault'] !== undefined && assignmentDefault === undefined)
  )
    return undefined;
  if (typeof row['revision'] !== 'number') return undefined;
  const assignmentModels = Array.isArray(row['assignmentModels'])
    ? (row['assignmentModels'] as AssignmentModelOption[])
    : undefined;
  return {
    revision: row['revision'],
    sourcePresetId: text(row['sourcePresetId']) ? row['sourcePresetId'] : '',
    sourcePresetName: text(row['sourcePresetName']) ? row['sourcePresetName'] : '',
    orchestrator,
    ...(assignmentDefault === undefined ? {} : { assignmentDefault }),
    ...(assignmentModels === undefined ? {} : { assignmentModels }),
  };
}

function planResult(value: unknown, method: string): ModelPlan {
  const parsed = plan(record(value)?.['plan']);
  if (parsed === undefined) throw new HostAnswerInvalid(`${method} returned no Model Plan.`);
  return parsed;
}

function catalogEntry(value: unknown): ModelCatalogEntry | undefined {
  const row = record(value);
  if (
    !text(row?.['provider']) ||
    !text(row['model']) ||
    !text(row['providerName']) ||
    !text(row['modelName'])
  )
    return undefined;
  const credential = row['credential'];
  return {
    provider: row['provider'],
    providerName: row['providerName'],
    model: row['model'],
    modelName: row['modelName'],
    ...(Array.isArray(row['efforts'])
      ? {
          efforts: some(row['efforts'], (value) => {
            const effort = record(value);
            return text(effort?.['id']) && text(effort['name'])
              ? { id: effort['id'], name: effort['name'] }
              : undefined;
          }),
        }
      : {}),
    ...(text(row['defaultEffort']) ? { defaultEffort: row['defaultEffort'] } : {}),
    ...(credential === 'missing' || credential === 'invalid' ? { credential } : {}),
  };
}

function preset(value: unknown): ModelPreset | undefined {
  const row = record(value);
  const orchestrator = route(row?.['orchestrator']);
  if (!text(row?.['id']) || !text(row['name']) || orchestrator === undefined) return undefined;
  const assignmentDefault = route(row['assignmentDefault']);
  return {
    id: row['id'],
    name: row['name'],
    orchestrator,
    ...(typeof row['revision'] === 'number' ? { revision: row['revision'] } : {}),
    ...(assignmentDefault === undefined ? {} : { assignmentDefault }),
    ...(Array.isArray(row['assignmentModels'])
      ? { assignmentModels: row['assignmentModels'] as AssignmentModelOption[] }
      : {}),
  };
}

function some<T>(rows: unknown, parse: (value: unknown) => T | undefined): T[] {
  return Array.isArray(rows)
    ? rows.flatMap((row) => {
        const parsed = parse(row);
        return parsed === undefined ? [] : [parsed];
      })
    : [];
}

export async function loadBotModel(
  client: HostClient,
  slug: string,
  requirePresets = false,
): Promise<BotModel> {
  const [state, catalog, presets] = await Promise.all([
    client.call<unknown>('modelPlan', { slug }),
    client.call<unknown>('modelCatalog', {}),
    client.call<unknown>('modelPresets', {}).catch((cause: unknown) => {
      if (requirePresets) throw cause;
      return { presets: [] };
    }),
  ]);
  const models = record(catalog)?.['models'];
  if (!Array.isArray(models)) throw new HostAnswerInvalid('modelCatalog returned no models.');
  const current = record(state);
  const saved = plan(current?.['plan']);
  const repair = record(current?.['repair']);
  const fallback = route(record(catalog)?.['default']);
  return {
    revision:
      typeof current?.['revision'] === 'number' ? current['revision'] : (saved?.revision ?? 0),
    ...(saved === undefined ? {} : { plan: saved }),
    ...(text(repair?.['code']) ? { repair: repair['code'] } : {}),
    models: some(models, catalogEntry),
    ...(fallback === undefined ? {} : { fallback }),
    presets: some(record(presets)?.['presets'], preset),
  };
}

export async function loadGlobalModel(client: HostClient): Promise<BotModel> {
  const [catalog, presets] = await Promise.all([
    client.call<unknown>('modelCatalog', {}),
    client.call<unknown>('modelPresets', {}),
  ]);
  const models = record(catalog)?.['models'];
  if (!Array.isArray(models)) throw new HostAnswerInvalid('modelCatalog returned no models.');
  const fallback = route(record(catalog)?.['default']);
  return {
    revision: 0,
    models: some(models, catalogEntry),
    presets: some(record(presets)?.['presets'], preset),
    ...(fallback === undefined ? {} : { fallback }),
  };
}

export function sameModel(
  a: Pick<ModelRoute, 'provider' | 'model'>,
  b: Pick<ModelRoute, 'provider' | 'model'> | undefined,
): boolean {
  return b !== undefined && a.provider === b.provider && a.model === b.model;
}

export function currentModel(model: BotModel): { route?: ModelRoute; name?: string } {
  const usableFallback =
    model.fallback !== undefined &&
    model.models.some((entry) => sameModel(entry, model.fallback) && entry.credential === undefined)
      ? model.fallback
      : undefined;
  const current = model.plan?.orchestrator ?? usableFallback;
  if (current === undefined) return {};
  return {
    route: current,
    name: model.models.find((entry) => sameModel(entry, current))?.modelName ?? current.model,
  };
}

export function modelChoice(
  model: BotModel,
  entry: Pick<ModelCatalogEntry, 'provider' | 'model'>,
): {
  expectedRevision: number;
  orchestrator: ModelRoute;
} {
  const previous = model.plan?.orchestrator;
  const effort = sameModel(entry, previous) ? previous?.reasoningEffort : undefined;
  const orchestrator: ModelRoute = {
    provider: entry.provider,
    model: entry.model,
    ...(effort === undefined ? {} : { reasoningEffort: effort }),
  };
  return {
    expectedRevision: model.plan?.revision ?? model.revision,
    orchestrator,
  };
}

export async function chooseModel(
  client: HostClient,
  slug: string,
  model: BotModel,
  entry: Pick<ModelCatalogEntry, 'provider' | 'model'>,
): Promise<ModelPlan> {
  return planResult(
    await client.call<unknown>('modelPlanCustomize', { slug, ...modelChoice(model, entry) }),
    'modelPlanCustomize',
  );
}

export async function applyModelPreset(
  client: HostClient,
  slug: string,
  presetId: string,
): Promise<ModelPlan> {
  return planResult(
    await client.call<unknown>('modelPresetApply', { slug, presetId }),
    'modelPresetApply',
  );
}

function grant(value: unknown): WorkspaceGrant | undefined {
  const row = record(value);
  if (
    !text(row?.['id']) ||
    !text(row['workspaceId']) ||
    !text(row['workspacePath']) ||
    !text(row['workspaceTitle'])
  )
    return undefined;
  return {
    id: row['id'],
    workspaceId: row['workspaceId'],
    workspacePath: row['workspacePath'],
    workspaceTitle: row['workspaceTitle'],
    orchestratorWrite: row['orchestratorWrite'] === true,
    ...(text(row['revokedAt']) ? { revokedAt: row['revokedAt'] } : {}),
  };
}

function grantResult(value: unknown, method: string): WorkspaceGrant {
  const parsed = grant(record(value)?.['grant']);
  if (parsed === undefined) throw new HostAnswerInvalid(`${method} returned no grant.`);
  return parsed;
}

export async function loadWorkspaceGrants(
  client: HostClient,
  slug: string,
): Promise<WorkspaceGrant[]> {
  const rows = record(await client.call<unknown>('grants', { slug }))?.['grants'];
  if (!Array.isArray(rows)) throw new HostAnswerInvalid('grants returned no list.');
  return some(rows, grant).filter((row) => row.revokedAt === undefined);
}

export async function revokeWorkspaceGrant(
  client: HostClient,
  slug: string,
  grantId: string,
): Promise<WorkspaceGrant> {
  return grantResult(await client.call<unknown>('grantRevoke', { slug, grantId }), 'grantRevoke');
}

function folder(value: unknown): HostFolder | undefined {
  const row = record(value);
  if (!text(row?.['name']) || !text(row['path'])) return undefined;
  return { name: row['name'], path: row['path'], hidden: row['hidden'] === true };
}

export async function listHostFolders(
  client: HostClient,
  path?: string,
): Promise<HostFolderListing> {
  const value = record(
    await client.call<unknown>('directoryPicker/list', path === undefined ? {} : { path }),
  );
  if (!text(value?.['path'])) throw new HostAnswerInvalid('The folder list has no location.');
  return {
    path: value['path'],
    crumbs: some(value['crumbs'], folder),
    entries: some(value['entries'], folder),
    truncated: value['truncated'] === true,
  };
}

function option(value: unknown): WorkspaceOption | undefined {
  const row = record(value);
  if (!text(row?.['id']) || !text(row['path']) || !text(row['title'])) return undefined;
  return { id: row['id'], path: row['path'], title: row['title'] };
}

export async function loadWorkspaceOptions(client: HostClient): Promise<WorkspaceOption[]> {
  const rows = record(await client.call<unknown>('workspaceOptions', {}))?.['workspaces'];
  if (!Array.isArray(rows)) throw new HostAnswerInvalid('workspaceOptions returned no list.');
  return some(rows, option);
}

async function createWorkspace(client: HostClient, path: string): Promise<string> {
  const workspace = record(
    record(await client.call<unknown>('workspace/create', { request: { path } }))?.['workspace'],
  );
  if (!text(workspace?.['workspaceId']))
    throw new HostAnswerInvalid('The computer did not register the folder.');
  return workspace['workspaceId'];
}

export async function resolveWorkspaceFolder(
  client: HostClient,
  path: string,
): Promise<WorkspaceOption> {
  const workspaceId = await createWorkspace(client, path);
  const resolved = (await loadWorkspaceOptions(client)).find((row) => row.id === workspaceId);
  if (resolved === undefined) throw new HostAnswerInvalid('The folder is not available to share.');
  return resolved;
}

export async function createWorkspaceGrant(
  client: HostClient,
  slug: string,
  workspaceId: string,
): Promise<WorkspaceGrant> {
  return grantResult(
    await client.call<unknown>('grantCreate', { slug, workspaceId }),
    'grantCreate',
  );
}

export async function authorizeWorkspacePath(
  client: HostClient,
  slug: string,
  path: string,
): Promise<WorkspaceGrant> {
  return createWorkspaceGrant(client, slug, await createWorkspace(client, path));
}

export async function approveWorkspaceRequest(
  client: HostClient,
  slug: string,
  channelId: string,
  requestMessageId: string,
  workspaceId: string,
): Promise<WorkspaceGrant> {
  const granted = grantResult(
    await client.call<unknown>('grantRequestApprove', {
      slug,
      channelId,
      requestMessageId,
      workspaceId,
      acknowledgeReadWrite: true,
    }),
    'grantRequestApprove',
  );
  if (!granted.orchestratorWrite)
    throw new HostAnswerInvalid('The computer did not confirm read/write access.');
  return granted;
}

function access(value: unknown, slug: string, method: string): AssignmentAccess {
  const preset = record(record(value)?.['preset']);
  const mode = preset?.['mode'];
  if (
    preset?.['botSlug'] !== slug ||
    (mode !== 'workspace-write' && mode !== 'danger-full-access') ||
    typeof preset['revision'] !== 'number'
  )
    throw new HostAnswerInvalid(`${method} returned no access setting.`);
  return {
    mode,
    scope: preset['scope'] === 'assignments' ? 'assignments' : 'chat',
    revision: preset['revision'],
  };
}

export async function loadAssignmentAccess(
  client: HostClient,
  slug: string,
): Promise<AssignmentAccess> {
  return access(
    await client.call<unknown>('assignmentAccessGet', { slug }),
    slug,
    'assignmentAccessGet',
  );
}

export async function setAssignmentAccess(
  client: HostClient,
  slug: string,
  mode: AccessMode,
  acknowledgeRisk: boolean,
  scope?: AccessScope,
): Promise<AssignmentAccess> {
  return access(
    await client.call<unknown>('assignmentAccessSet', {
      slug,
      mode,
      acknowledgeRisk,
      ...(scope === undefined ? {} : { scope }),
    }),
    slug,
    'assignmentAccessSet',
  );
}

export async function loadApprovalTemplates(
  client: HostClient,
  slug: string,
): Promise<ApprovalTemplates> {
  const value = record(await client.call<unknown>('approvalTemplates', { slug }));
  const selected = value?.['selected'];
  if (!Array.isArray(value?.['templates']) || (selected !== null && !text(selected)))
    throw new HostAnswerInvalid('approvalTemplates returned no templates.');
  return {
    templates: some(value['templates'], (item) => {
      const row = record(item);
      return text(row?.['name']) && text(row['title']) && text(row['description'])
        ? { name: row['name'], title: row['title'], description: row['description'] }
        : undefined;
    }),
    selected,
  };
}

export async function setApprovalTemplate(
  client: HostClient,
  slug: string,
  template: string | null,
): Promise<void> {
  const value = record(await client.call<unknown>('botApprovalTemplateSet', { slug, template }));
  if (record(value?.['bot'])?.['slug'] !== slug)
    throw new HostAnswerInvalid('botApprovalTemplateSet did not return the Bot.');
}

export interface BotSettings {
  loadModel(): Promise<BotModel>;
  chooseModel(model: BotModel, entry: ModelCatalogEntry): Promise<ModelPlan>;
  applyPreset(presetId: string): Promise<ModelPlan>;
  loadGrants(): Promise<WorkspaceGrant[]>;
  revokeGrant(grantId: string): Promise<WorkspaceGrant>;
  listFolders(path?: string): Promise<HostFolderListing>;
  loadWorkspaceOptions(): Promise<WorkspaceOption[]>;
  resolveFolder(path: string): Promise<WorkspaceOption>;
  authorizeFolder(path: string, workspaceId?: string): Promise<WorkspaceGrant>;
  loadAccess(): Promise<AssignmentAccess>;
  setAccess(
    mode: AccessMode,
    acknowledgeRisk: boolean,
    scope?: AccessScope,
  ): Promise<AssignmentAccess>;
  loadTemplates(): Promise<ApprovalTemplates>;
  setTemplate(template: string | null): Promise<void>;
}

export function botSettings(client: HostClient, slug: string): BotSettings {
  return {
    loadModel: () => loadBotModel(client, slug),
    chooseModel: (model, entry) => chooseModel(client, slug, model, entry),
    applyPreset: (presetId) => applyModelPreset(client, slug, presetId),
    loadGrants: () => loadWorkspaceGrants(client, slug),
    revokeGrant: (grantId) => revokeWorkspaceGrant(client, slug, grantId),
    listFolders: (path) => listHostFolders(client, path),
    loadWorkspaceOptions: () => loadWorkspaceOptions(client),
    resolveFolder: (path) => resolveWorkspaceFolder(client, path),
    authorizeFolder: (path, workspaceId) =>
      workspaceId === undefined
        ? authorizeWorkspacePath(client, slug, path)
        : createWorkspaceGrant(client, slug, workspaceId),
    loadAccess: () => loadAssignmentAccess(client, slug),
    setAccess: (mode, acknowledgeRisk, scope) =>
      setAssignmentAccess(client, slug, mode, acknowledgeRisk, scope),
    loadTemplates: () => loadApprovalTemplates(client, slug),
    setTemplate: (template) => setApprovalTemplate(client, slug, template),
  };
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function folderBrowsingUnavailable(error: unknown): boolean {
  return error instanceof MethodRefused && error.code === 'directory-picker/unavailable';
}
