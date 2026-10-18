import type { ModelCatalogEntry } from '../models/catalog.js';
import type { ModelRoute, PersonaBotModelPlan } from '../models/presets.js';

export type ImCommandName = 'commands' | 'help' | 'status' | 'model' | 'effort' | 'stop' | 'new';

export interface ParsedImCommand {
  name: ImCommandName;
  chinese: boolean;
  argument?: string;
}

const aliases: readonly (readonly [string, ImCommandName, boolean])[] = [
  ['commands', 'commands', false],
  ['help', 'help', false],
  ['命令', 'commands', true],
  ['帮助', 'help', true],
  ['status', 'status', false],
  ['状态', 'status', true],
  ['model', 'model', false],
  ['模型', 'model', true],
  ['effort', 'effort', false],
  ['强度', 'effort', true],
  ['stop', 'stop', false],
  ['停止', 'stop', true],
  ['new', 'new', false],
  ['新会话', 'new', true],
];

const takesArgument = new Set<ImCommandName>(['model', 'effort']);

export function parseImCommand(text: string): ParsedImCommand | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/') && !trimmed.startsWith('／')) return undefined;
  if (/[\n\r]/u.test(trimmed)) return undefined;
  const body = trimmed.slice(1);
  if (body === '') return undefined;
  const separator = body.search(/\s/u);
  const token = separator === -1 ? body : body.slice(0, separator);
  const argument = separator === -1 ? '' : body.slice(separator + 1).trim();
  const alias = aliases.find(([name]) => name === token.toLowerCase());
  if (alias === undefined) return undefined;
  const [, name, chinese] = alias;
  if (argument !== '' && !takesArgument.has(name)) return undefined;
  return { name, chinese, ...(argument === '' ? {} : { argument }) };
}

export type ImCommandManage = 'allowed' | 'pairing-required' | 'web-only';

export function imCommandRequiresAuthority(command: ParsedImCommand): boolean {
  if (command.name === 'model' || command.name === 'effort') return command.argument !== undefined;
  return command.name === 'stop' || command.name === 'new';
}

export function imCommandAuthority(input: {
  command: ParsedImCommand;
  platform: string;
  pairingAvailable: boolean;
  managementPairing: boolean;
}): ImCommandManage {
  if (!imCommandRequiresAuthority(input.command)) return 'allowed';
  if (input.platform === 'weixin') return 'allowed';
  if (input.managementPairing) return 'allowed';
  if (!input.pairingAvailable || input.platform !== 'feishu') return 'web-only';
  return 'pairing-required';
}

export interface ImCommandServices {
  botDisplayName(botSlug: string): string | undefined;
  plan(botSlug: string): Promise<PersonaBotModelPlan | undefined>;
  catalog(): Promise<ModelCatalogEntry[]>;
  defaultRoute?(): ModelRoute | undefined;
  applyModel(botSlug: string, route: ModelRoute, assertCurrent?: () => void): Promise<void>;
  stopTurn(botSlug: string): Promise<{ sessionId: string } | undefined>;
  startFreshOrchestrator(botSlug: string, assertCurrent?: () => void): Promise<'started' | 'busy'>;
  turnRunning(botSlug: string): boolean;
}

export interface ImCommandDeps {
  command: ParsedImCommand;
  chinese: boolean;
  botSlug: string;
  botDisplayName: string;
  working: boolean;
  manage: ImCommandManage;
  assertCurrent?(): void;
  host: ImCommandServices;
}

interface EffortOption {
  id: string;
  name: string;
}

function isCurrentModel(route: ModelRoute | undefined, entry: ModelCatalogEntry): boolean {
  return route !== undefined && route.provider === entry.provider && route.model === entry.model;
}

function modelLabel(entry: ModelCatalogEntry): string {
  return `${entry.modelName} [${entry.provider}/${entry.model}]`;
}

function availableModels(catalog: readonly ModelCatalogEntry[]): ModelCatalogEntry[] {
  return catalog.filter((entry) => entry.credential === undefined);
}

function select<T>(
  items: readonly T[],
  query: string,
  keys: (item: T) => string[],
): { item?: T; candidates: T[] } {
  const needle = query.trim().toLowerCase();
  if (needle === '') return { candidates: [] };
  const exact = items.filter((item) => keys(item).some((value) => value.toLowerCase() === needle));
  if (exact.length === 1) return { item: exact[0]!, candidates: exact };
  const matches = items.filter((item) =>
    keys(item).some((value) => value.toLowerCase().includes(needle)),
  );
  if (exact.length === 0 && matches.length === 1) return { item: matches[0]!, candidates: matches };
  return { candidates: exact.length > 0 ? exact : matches };
}

function candidateList<T>(
  items: readonly T[],
  label: (item: T) => string,
  zh: boolean,
  choices: readonly T[],
): string {
  const candidates = items.length ? items : choices;
  return [
    items.length
      ? zh
        ? '没有唯一匹配，候选：'
        : 'No unique match; candidates:'
      : zh
        ? '没有匹配项，请尝试：'
        : 'No match. Try:',
    ...candidates.slice(0, 5).map((item) => `${choices.indexOf(item) + 1}. ${label(item)}`),
  ].join('\n');
}

function commandList(zh: boolean): string {
  return (
    zh
      ? [
          '/commands（/命令）- 列出所有命令',
          '/help（/帮助）- 列出所有命令',
          '/status（/状态）- 查看名称、模型、强度与运行状态',
          '/model（/模型）- 列出模型；/model <序号|名称> 切换模型',
          '/effort（/强度）- 列出强度；/effort <序号|名称> 设置强度',
          '/stop（/停止）- 停止当前运行的任务',
          '/new（/新会话）- 让下一条消息开启新会话',
        ]
      : [
          '/commands - list every command',
          '/help - list every command',
          '/status - name, model, effort and whether a turn is running',
          '/model - list models; /model <number|name> switches model',
          '/effort - list efforts; /effort <number|name> sets effort',
          '/stop - stop the running turn',
          '/new - start a fresh session on the next message',
        ]
  ).join('\n');
}

function statusText(deps: ImCommandDeps, route: ModelRoute | undefined): string {
  const zh = deps.chinese;
  const model =
    route === undefined ? (zh ? '未知' : 'unknown') : `${route.provider}/${route.model}`;
  return [
    `${zh ? '名称' : 'Bot'}: ${deps.botDisplayName}`,
    `${zh ? '模型' : 'Model'}: ${model}`,
    `${zh ? '强度' : 'Effort'}: ${route?.reasoningEffort ?? (zh ? '提供方默认' : 'provider default')}`,
    `${zh ? '任务' : 'Turn'}: ${deps.working ? (zh ? '运行中' : 'running') : zh ? '空闲' : 'idle'}`,
  ].join('\n');
}

function listModels(
  models: readonly ModelCatalogEntry[],
  current: ModelRoute | undefined,
  zh: boolean,
): string {
  if (models.length === 0) return zh ? '没有可用模型。' : 'No models are available.';
  return [
    zh ? '可用模型：' : 'Models:',
    ...models.map(
      (entry, index) =>
        `${index + 1}. ${isCurrentModel(current, entry) ? '✓ ' : ''}${modelLabel(entry)}`,
    ),
  ].join('\n');
}

function listEfforts(
  options: readonly EffortOption[],
  current: ModelRoute | undefined,
  zh: boolean,
): string {
  const currentId = current?.reasoningEffort ?? '';
  return [
    zh ? '可用强度：' : 'Efforts:',
    ...options.map(
      (option, index) => `${index + 1}. ${option.id === currentId ? '✓ ' : ''}${option.name}`,
    ),
  ].join('\n');
}

function effortOptions(
  current: ModelRoute | undefined,
  models: readonly ModelCatalogEntry[],
  zh: boolean,
): EffortOption[] {
  const entry = models.find((item) => isCurrentModel(current, item));
  return [
    { id: '', name: zh ? '提供方默认' : 'Provider default' },
    ...(entry?.efforts ?? []).map((effort) => ({ id: effort.id, name: effort.name })),
  ];
}

function refuseChange(manage: 'pairing-required' | 'web-only', zh: boolean): string {
  if (manage === 'web-only')
    return zh
      ? '此平台不支持在 IM 中修改该 Bot，请改用 Web 端。'
      : 'Changing this Bot from IM is not available on this platform; use the Web app.';
  return zh
    ? '在 IM 中修改该 Bot 需要已批准的管理配对，请让 Web 管理员批准。'
    : 'Changing this Bot from IM needs an approved management pairing; ask a Web administrator to approve it.';
}

async function changeModel(deps: ImCommandDeps): Promise<string> {
  const zh = deps.chinese;
  const current = await currentRoute(deps);
  const models = availableModels(await deps.host.catalog());
  const trimmed = (deps.command.argument ?? '').trim();
  const numeric = /^\d+$/u.test(trimmed) ? Number(trimmed) : undefined;
  let entry: ModelCatalogEntry | undefined;
  if (numeric !== undefined) {
    if (numeric >= 1 && numeric <= models.length) entry = models[numeric - 1];
  } else {
    const selected = select(models, trimmed, (item) => [
      item.model,
      item.modelName,
      `${item.provider}/${item.model}`,
    ]);
    entry = selected.item;
    if (entry === undefined) return candidateList(selected.candidates, modelLabel, zh, models);
  }
  if (entry === undefined) return candidateList([], modelLabel, zh, models);
  const effort =
    current?.reasoningEffort !== undefined &&
    entry.efforts.some((value) => value.id === current.reasoningEffort)
      ? current.reasoningEffort
      : undefined;
  try {
    deps.assertCurrent?.();
    await deps.host.applyModel(
      deps.botSlug,
      {
        provider: entry.provider,
        model: entry.model,
        ...(effort === undefined ? {} : { reasoningEffort: effort }),
      },
      deps.assertCurrent,
    );
  } catch {
    return zh
      ? '切换模型失败，请重试或改用 Web 端。'
      : 'Could not change the model; try again or use the Web app.';
  }
  return `${zh ? '模型' : 'Model'}: ${modelLabel(entry)}`;
}

async function changeEffort(deps: ImCommandDeps, current: ModelRoute): Promise<string> {
  const zh = deps.chinese;
  const options = effortOptions(current, await deps.host.catalog(), zh);
  const trimmed = (deps.command.argument ?? '').trim();
  const numeric = /^\d+$/u.test(trimmed) ? Number(trimmed) : undefined;
  let option: EffortOption | undefined;
  if (numeric !== undefined) {
    if (numeric >= 1 && numeric <= options.length) option = options[numeric - 1];
  } else if (trimmed.toLowerCase() === 'default' || trimmed === '默认') {
    option = options[0];
  } else {
    const selected = select(
      options.filter((item) => item.id !== ''),
      trimmed,
      (item) => [item.id, item.name],
    );
    option = selected.item;
    if (option === undefined)
      return candidateList(selected.candidates, (item) => item.name, zh, options);
  }
  if (option === undefined) return candidateList([], (item) => item.name, zh, options);
  try {
    deps.assertCurrent?.();
    await deps.host.applyModel(
      deps.botSlug,
      {
        provider: current.provider,
        model: current.model,
        ...(option.id === '' ? {} : { reasoningEffort: option.id }),
      },
      deps.assertCurrent,
    );
  } catch {
    return zh
      ? '设置强度失败，请重试或改用 Web 端。'
      : 'Could not change the effort; try again or use the Web app.';
  }
  return `${zh ? '强度' : 'Effort'}: ${option.name}`;
}

async function currentRoute(deps: ImCommandDeps): Promise<ModelRoute | undefined> {
  const plan = await deps.host.plan(deps.botSlug);
  return plan?.orchestrator ?? deps.host.defaultRoute?.();
}

async function stopText(deps: ImCommandDeps): Promise<string> {
  const zh = deps.chinese;
  deps.assertCurrent?.();
  const stopped = await deps.host.stopTurn(deps.botSlug);
  return stopped === undefined
    ? zh
      ? `${deps.botDisplayName} 当前没有在运行的任务。`
      : `${deps.botDisplayName} is not working right now.`
    : zh
      ? '已停止。'
      : 'Stopped.';
}

async function freshText(deps: ImCommandDeps): Promise<string> {
  const zh = deps.chinese;
  deps.assertCurrent?.();
  const outcome = await deps.host.startFreshOrchestrator(deps.botSlug, deps.assertCurrent);
  return outcome === 'busy'
    ? zh
      ? 'Bot 正在运行，请先 /stop 再试。'
      : 'The Bot is working right now; /stop it first.'
    : zh
      ? '已准备好新会话，下一条消息将开启新会话。'
      : 'A fresh session is ready; your next message starts a new one.';
}

export async function executeImCommand(deps: ImCommandDeps): Promise<string> {
  const { command } = deps;
  if (imCommandRequiresAuthority(command) && deps.manage !== 'allowed')
    return refuseChange(deps.manage, deps.chinese);
  deps.assertCurrent?.();
  switch (command.name) {
    case 'commands':
    case 'help':
      return commandList(deps.chinese);
    case 'status':
      return statusText(deps, await currentRoute(deps));
    case 'model': {
      if (command.argument !== undefined) return changeModel(deps);
      const current = await currentRoute(deps);
      return listModels(availableModels(await deps.host.catalog()), current, deps.chinese);
    }
    case 'effort': {
      const current = await currentRoute(deps);
      if (current === undefined)
        return deps.chinese ? '当前没有可用模型。' : 'No model is available.';
      if (command.argument !== undefined) return changeEffort(deps, current);
      return listEfforts(
        effortOptions(current, await deps.host.catalog(), deps.chinese),
        current,
        deps.chinese,
      );
    }
    case 'stop':
      return stopText(deps);
    case 'new':
      return freshText(deps);
  }
}

export function createImCommandExecutor(): (deps: () => ImCommandDeps) => Promise<string> {
  const tails = new Map<string, Promise<unknown>>();
  return (getDeps) => {
    const slug = getDeps().botSlug;
    const pending = (tails.get(slug) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => executeImCommand(getDeps()));
    tails.set(slug, pending);
    void pending
      .finally(() => {
        if (tails.get(slug) === pending) tails.delete(slug);
      })
      .catch(() => undefined);
    return pending;
  };
}
