export const ADMIN_PERMISSIONS = Object.freeze([
  'members.manage',
  'roles.manage',
  'team.settings',
  'channels.create',
  'channels.manageAll',
  'dm.humans',
  'bots.createPrivate',
  'bots.createPublic',
  'bots.manageAll',
  'models.use',
  'models.configure',
  'im.bind',
  'workspaces.manageShared',
  'workspaces.createFolder',
  'approvals.opaqueTools',
  'usage.view',
  'audit.view',
]);

export const MEMBER_PERMISSIONS = Object.freeze(['dm.humans']);

export const DEFAULT_CHANNEL_POLICY = Object.freeze({
  addMembers: 'everyone',
  post: 'everyone',
  mentionAll: 'everyone',
  addBots: 'admins',
  editDetails: 'admins',
});

export const OWNER_HUMAN_CONTEXT = Object.freeze({ humanId: 'local-human' });

const DERIVED_TITLE_LENGTH = 40;

export function deriveAssignmentTitle(description: string): string {
  const line =
    description
      .split(/\r?\n/u)
      .map((part) => part.replace(/\s+/gu, ' ').trim())
      .find((part) => part !== '') ?? '';
  const chars = [...line];
  if (chars.length <= DERIVED_TITLE_LENGTH) return line === '' ? 'Assignment' : line;
  const head = chars.slice(0, DERIVED_TITLE_LENGTH).join('');
  const sentence = /^(.{12,}?[.!?。！？；;:：])(?:\s|$)/u.exec(head)?.[1];
  if (sentence !== undefined) return sentence.replace(/[.。;；:：]$/u, '');
  const space = /\s/u.test(chars[DERIVED_TITLE_LENGTH] ?? '') ? head.length : head.lastIndexOf(' ');
  const cut = space >= 12 ? head.slice(0, space) : head;
  return `${cut.replace(/[\s,，、.。;；:：-]+$/u, '')}…`;
}

interface AssignmentModelOption {
  provider: string;
  model: string;
  allowedEfforts: string[];
  defaultEffort: string;
  note?: string;
}

interface AssignmentGroupOption {
  group: string;
  allowedEfforts?: string[];
  defaultEffort?: string;
  note?: string;
}

interface AssignmentEngine {
  engine: string;
  accountId?: string;
  model?: string;
  effort?: string;
}

type EngineSelection = { kind: 'engine' } & Omit<AssignmentEngine, 'effort'>;
type PresetSubChoice =
  | ({ kind: 'model' } & AssignmentModelOption)
  | ({ kind: 'group' } & AssignmentGroupOption)
  | ({ kind: 'engine'; note?: string } & AssignmentEngine);

interface PresetSub {
  choices: PresetSubChoice[];
  default:
    | { kind: 'model'; provider: string; model: string }
    | { kind: 'group'; group: string }
    | EngineSelection
    | null;
}

export interface ModelPreset {
  sub?: PresetSub;
  assignmentDefault?: { provider: string; model: string; reasoningEffort?: string };
  assignmentFollowsMain?: boolean;
  assignmentModels?: AssignmentModelOption[];
  assignmentGroups?: string[];
  assignmentDefaultGroupId?: string;
  assignmentGroupOptions?: AssignmentGroupOption[];
  assignmentEngine?: AssignmentEngine;
}

export function presetSubFromLegacy(preset: ModelPreset): PresetSub {
  const route = preset.assignmentDefault;
  if (preset.assignmentFollowsMain === true || route === undefined)
    return { choices: [], default: null };
  const models = preset.assignmentModels ?? [
    {
      provider: route.provider,
      model: route.model,
      allowedEfforts: [route.reasoningEffort ?? ''],
      defaultEffort: route.reasoningEffort ?? '',
    },
  ];
  return {
    choices: [
      ...models.map<PresetSubChoice>((model) => ({ ...model, kind: 'model' })),
      ...(preset.assignmentGroups ?? []).map<PresetSubChoice>((group) => ({
        ...preset.assignmentGroupOptions?.find((option) => option.group === group),
        kind: 'group',
        group,
      })),
    ],
    default:
      preset.assignmentDefaultGroupId === undefined
        ? { kind: 'model', provider: route.provider, model: route.model }
        : { kind: 'group', group: preset.assignmentDefaultGroupId },
  };
}

export function presetSubWithEngine(
  sub: PresetSub,
  engine: AssignmentEngine | undefined,
): PresetSub {
  if (engine === undefined || sub.choices.some((choice) => choice.kind === 'engine')) return sub;
  const selection: EngineSelection = {
    kind: 'engine',
    engine: engine.engine,
    ...(engine.accountId === undefined ? {} : { accountId: engine.accountId }),
    ...(engine.model === undefined ? {} : { model: engine.model }),
  };
  return {
    choices: [
      ...sub.choices,
      { ...selection, ...(engine.effort === undefined ? {} : { effort: engine.effort }) },
    ],
    default: selection,
  };
}

interface Parser<T> {
  parse(value: unknown): T;
}

type ParsedShape<Shape extends Record<string, Parser<unknown>>> = {
  [Key in keyof Shape]: ReturnType<Shape[Key]['parse']>;
};

function parseString(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('minimal-member: expected a string');
  return value;
}

export const z = Object.freeze({
  string() {
    return { parse: parseString, nullable: () => ({ parse: parseNullableString }) };
  },
  array<T>(item: Parser<T>): Parser<T[]> {
    return {
      parse(value) {
        if (!Array.isArray(value)) throw new TypeError('minimal-member: expected an array');
        return value.map((entry) => item.parse(entry));
      },
    };
  },
  object<Shape extends Record<string, Parser<unknown>>>(shape: Shape): Parser<ParsedShape<Shape>> {
    return {
      parse(value) {
        if (typeof value !== 'object' || value === null || Array.isArray(value))
          throw new TypeError('minimal-member: expected a role row');
        return Object.fromEntries(
          Object.entries(shape).map(([key, parser]) => [
            key,
            parser.parse(Reflect.get(value, key)),
          ]),
        ) as ParsedShape<Shape>;
      },
    };
  },
});

function parseNullableString(value: unknown): string | null {
  return value === null ? null : parseString(value);
}
