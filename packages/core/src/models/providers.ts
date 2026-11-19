import { randomUUID } from 'node:crypto';
import {
  credentialRef,
  type CredentialProvider,
  type CredentialRef,
} from '@deepseek-ai/dsh-credentials';
import { ReasoningEffortId, type LlmRuntime } from '@deepseek-ai/dsh-llm';
import type { SettingsForms, SettingsPathOp } from '@deepseek-ai/dsh-settings';
import { z } from 'zod';
import type { RestingRoute } from './route-rest.js';

const api = 'openai-completions';
const deepseekCompat = {
  thinkingFormat: 'deepseek',
  requiresReasoningContentOnAssistantMessages: true,
  supportsStore: false,
  supportsDeveloperRole: false,
  maxTokensField: 'max_tokens',
  supportsStrictMode: true,
};
const deepseekEfforts = { off: null, high: 'high', max: 'max' };

function deepseekModel(id: string, name: string, input: string[]) {
  return {
    id,
    name,
    input,
    contextWindow: 1_000_000,
    compat: deepseekCompat,
    reasoningEfforts: deepseekEfforts,
  };
}

const templates = {
  'opencode-go': {
    baseURL: 'https://opencode.ai/inference/go/v1',
    models: [
      deepseekModel('deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', ['text', 'image']),
      deepseekModel('deepseek-v4-pro', 'DeepSeek V4 Pro', ['text']),
    ],
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com',
    models: [
      deepseekModel('deepseek-flash', 'DeepSeek V4.1 Flash', ['text', 'image']),
      deepseekModel('deepseek-v4-pro', 'DeepSeek V4 Pro', ['text']),
    ],
  },
};

const keyInput = z
  .string()
  .trim()
  .min(1)
  .max(8192)
  .regex(/^[^\s\p{C}]+$/u);
const nameInput = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[^\p{C}]+$/u);
const revisionInput = z.number().int().nonnegative();
const targetInput = z.object({ id: z.string().min(1).max(200), expectedRevision: revisionInput });
const endpointInput = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  });
const addFields = { name: nameInput, key: keyInput, expectedRevision: revisionInput };
export const addModelProviderInput = z.discriminatedUnion('template', [
  z.object({ ...addFields, template: z.enum(['opencode-go', 'deepseek']) }),
  z.object({
    ...addFields,
    template: z.literal('custom'),
    endpoint: endpointInput,
    model: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[^\s\p{C}]+$/u),
  }),
]);
export const editModelProviderInput = targetInput
  .extend({
    name: nameInput.optional(),
    key: keyInput.optional(),
  })
  .refine(({ name, key }) => name !== undefined || key !== undefined);
export const removeModelProviderInput = targetInput;

export type AddModelProvider = z.infer<typeof addModelProviderInput>;
export type EditModelProvider = z.infer<typeof editModelProviderInput>;
export type RemoveModelProvider = z.infer<typeof removeModelProviderInput>;

export interface ModelProviderView {
  id: string;
  name: string;
  keyLast4?: string;
  keyStored: boolean;
  modelCount: number;
  availability: 'available' | 'unavailable' | 'resting';
  restingUntil?: string;
  canRename: boolean;
  canReplaceKey: boolean;
  canRemove: boolean;
  revision: number;
}

export interface ModelProvidersView {
  revision?: number;
  providers: ModelProviderView[];
}

export interface ModelProviderSave {
  id: string;
  keyStored: boolean;
  modelCount: number;
  testReply: 'ok' | 'failed' | 'skipped';
  credentialCleanupPending?: boolean;
}

export interface ModelProviderRemoval {
  id: string;
  credentialCleanupPending?: boolean;
}

type ProviderErrorCode =
  | 'invalid-input'
  | 'provider-conflict'
  | 'provider-unavailable'
  | 'provider-inherited'
  | 'provider-in-use'
  | 'provider-write-failed'
  | 'provider-key-write-failed'
  | 'provider-not-found'
  | 'provider-read-only';

export class ModelProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly uses: string[] = [],
  ) {
    super(code);
  }
}

interface SettingsView {
  ns: string;
  revision: number;
  value: unknown;
  user?: unknown;
  base?: unknown;
  secrets?: { path: string[]; set: boolean }[];
}

interface ProviderLocation {
  provider: string;
  settingsNs: string;
  settingsPath: readonly string[];
  displayName?: string;
  nativeAuth?: { env: readonly string[]; oauth: boolean };
}

interface ProviderSources {
  settings: Pick<SettingsForms, 'mutate'> & {
    describe(options: { redactSecrets: true }): SettingsView[];
    writable?: boolean;
  };
  credentials: Pick<CredentialProvider, 'describe' | 'resolve' | 'set' | 'unset'>;
  directory(): ProviderLocation[];
  activeProviders(): { id: string; name?: string }[];
  models(id: string): Promise<{ id: string }[]>;
  rests(): RestingRoute[];
  uses(id: string): string[];
  probe(id: string, model: string): Promise<boolean>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function object(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function at(value: unknown, path: readonly string[]): Record<string, unknown> | undefined {
  return object(path.reduce<unknown>((entry, key) => object(entry)?.[key], value));
}

function reference(value: unknown): CredentialRef | undefined {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)
    ? credentialRef(value)
    : undefined;
}

function exclusiveReference(value: unknown, ref: CredentialRef): boolean {
  if (value === ref) return false;
  if (typeof value === 'object' && value !== null)
    return Object.values(value).every((child) => exclusiveReference(child, ref));
  return true;
}

function isDictionaryRoute(location: ProviderLocation): boolean {
  return location.settingsPath.length === 2 && location.settingsPath[0] === 'providers';
}

function managedReference(ref: CredentialRef): boolean {
  return /^BOTHARNESS_MODEL_PROVIDER_[A-F0-9]{32}$/u.test(ref);
}

function newReference(): CredentialRef {
  return credentialRef(
    'BOTHARNESS_MODEL_PROVIDER_' + randomUUID().replaceAll('-', '').toUpperCase(),
  );
}

export function createModelProviders(source: ProviderSources) {
  const settings = () => source.settings.describe({ redactSecrets: true });
  let pending = Promise.resolve();

  function serialize<T>(run: () => Promise<T>): Promise<T> {
    const result = pending.then(run);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function snapshot() {
    const sections = settings();
    const active = new Map(
      source.activeProviders().map((provider) => [provider.id, provider.name ?? provider.id]),
    );
    const directory = source.directory();
    const locations = new Map(directory.map((entry) => [entry.provider, entry]));
    const templateNs = directory.find(
      (entry) => entry.provider === 'opencode-go' && isDictionaryRoute(entry),
    )?.settingsNs;
    const addSection = sections.find(({ ns }) => ns === templateNs);
    const rows = new Map<
      string,
      {
        location: ProviderLocation;
        section: SettingsView;
        value: Record<string, unknown> | undefined;
      }
    >();
    for (const location of locations.values()) {
      const section = sections.find((entry) => entry.ns === location.settingsNs);
      if (!section) continue;
      const value = at(section.value, location.settingsPath);
      if (
        location.nativeAuth?.oauth &&
        location.nativeAuth.env.length === 0 &&
        value?.['apiKeyEnv'] === undefined
      )
        continue;
      if (location.provider === 'deepseek-account') continue;
      if (active.has(location.provider) || (isDictionaryRoute(location) && value !== undefined))
        rows.set(location.provider, { location, section, value });
    }
    return { active, directory, addSection, rows };
  }

  function fence(section: SettingsView, expected: number) {
    if (source.settings.writable === false) throw new ModelProviderError('provider-unavailable');
    if (section.revision !== expected) throw new ModelProviderError('provider-conflict');
  }

  async function change(section: SettingsView, ops: SettingsPathOp[]) {
    try {
      await source.settings.mutate(section.ns, ops, section.revision);
    } catch (error) {
      if (object(error)?.['code'] === 'SETTINGS_CONFLICT')
        throw new ModelProviderError('provider-conflict');
      if (
        error instanceof Error &&
        error.message.includes('is overridden by a home patch or command-line overlay')
      )
        throw new ModelProviderError('provider-read-only');
      throw new ModelProviderError('provider-write-failed');
    }
  }

  async function discard(ref: CredentialRef | undefined): Promise<boolean> {
    if (ref === undefined || !managedReference(ref)) return false;
    try {
      if (settings().some(({ value, base, user }) => !exclusiveReference([value, base, user], ref)))
        return false;
      await source.credentials.unset(ref);
      return false;
    } catch {
      return true;
    }
  }

  async function saveKey(key: string, apply: (ref: CredentialRef) => Promise<void>) {
    const ref = newReference();
    try {
      await source.credentials.set(ref, key);
    } catch {
      await discard(ref);
      throw new ModelProviderError('provider-key-write-failed');
    }
    try {
      await apply(ref);
    } catch (error) {
      await discard(ref);
      throw error;
    }
  }

  async function credential(refs: CredentialRef[]) {
    for (const ref of refs) {
      const info = await source.credentials.describe(ref).catch(() => undefined);
      if (info?.configured !== true) continue;
      const resolved = await source.credentials.resolve(ref).catch(() => undefined);
      const value = resolved?.value;
      return {
        keyStored: true,
        ...(value !== undefined && value.length > 4 ? { keyLast4: value.slice(-4) } : {}),
      };
    }
    return { keyStored: false };
  }

  async function test(
    id: string,
    keyStored: boolean,
    credentialCleanupPending = false,
  ): Promise<ModelProviderSave> {
    const models = await source.models(id).catch(() => []);
    const [first] = models;
    const model =
      models.find((entry) => entry.id === 'deepseek-v4.1-flash' || entry.id === 'deepseek-flash') ??
      first;
    const testReply =
      !keyStored || model === undefined
        ? 'skipped'
        : (await source.probe(id, model.id).catch(() => false))
          ? 'ok'
          : 'failed';
    return {
      id,
      keyStored,
      modelCount: models.length,
      testReply,
      ...(credentialCleanupPending ? { credentialCleanupPending } : {}),
    };
  }

  return {
    async list(): Promise<ModelProvidersView> {
      const { addSection, active, rows } = snapshot();
      const rests = source.rests();
      const writable = source.settings.writable !== false;
      const providers = await Promise.all(
        [...rows.values()].map(async ({ location, section, value }): Promise<ModelProviderView> => {
          const { provider: id, settingsPath } = location;
          const explicit = reference(value?.['apiKeyEnv']);
          const refs =
            explicit === undefined
              ? (location.nativeAuth?.env ?? []).flatMap((name) => reference(name) ?? [])
              : [explicit];
          const secretConfigured = section.secrets?.some(
            ({ path, set }) =>
              set &&
              path.length === settingsPath.length + 1 &&
              path[path.length - 1] === 'apiKey' &&
              settingsPath.every((key, index) => key === path[index]),
          );
          const key = await credential(refs);
          const models = active.has(id) ? await source.models(id).catch(() => []) : [];
          const providerRests = rests.filter((rest) => rest.provider === id);
          const everyResting =
            models.length > 0 &&
            models.every(({ id: model }) => providerRests.some((rest) => rest.model === model));
          const [earliest] = providerRests.map(({ until }) => until).sort();
          const label = active.get(id);
          const name = value?.['displayName'];
          const fallback = id === 'opencode-go' ? 'OpenCode Go' : (location.displayName ?? id);
          const canRename = writable && isDictionaryRoute(location);
          return {
            id,
            name:
              typeof name === 'string' && name
                ? name
                : label === id
                  ? fallback
                  : (label ?? fallback),
            ...key,
            keyStored: key.keyStored || secretConfigured === true,
            modelCount: models.length,
            availability:
              models.length === 0 ? 'unavailable' : everyResting ? 'resting' : 'available',
            ...(everyResting && earliest !== undefined ? { restingUntil: earliest } : {}),
            canRename,
            canReplaceKey: writable && (canRename || explicit !== undefined),
            canRemove:
              canRename &&
              at(section.user, settingsPath) !== undefined &&
              at(section.base, settingsPath) === undefined,
            revision: section.revision,
          };
        }),
      );
      return {
        ...(writable && addSection !== undefined ? { revision: addSection.revision } : {}),
        providers,
      };
    },
    async add(input: AddModelProvider, authorize = () => {}) {
      return serialize(async () => {
        authorize();
        const { active, directory, addSection, rows } = snapshot();
        if (!addSection) throw new ModelProviderError('provider-unavailable');
        fence(addSection, input.expectedRevision);
        const prefix = input.template;
        const builtIn = directory.some(
          (entry) =>
            entry.provider === prefix &&
            entry.settingsNs === addSection.ns &&
            isDictionaryRoute(entry),
        );
        const occupied = (id: string) =>
          rows.has(id) ||
          active.has(id) ||
          at(addSection.value, ['providers', id]) !== undefined ||
          directory.some((entry) => entry.provider === id && (!builtIn || id !== prefix));
        let id: string = prefix;
        for (let index = 2; occupied(id); index++) id = `${prefix}-${index}`;
        const profile =
          input.template === 'custom'
            ? { api, baseURL: input.endpoint, models: [{ id: input.model }] }
            : id === prefix && builtIn
              ? {}
              : { api, ...templates[input.template] };
        await saveKey(input.key, (ref) => {
          authorize();
          return change(addSection, [
            {
              op: 'set',
              path: ['providers', id],
              value: { ...profile, displayName: input.name, apiKeyEnv: ref },
            },
          ]);
        });
        return test(id, true);
      });
    },
    async edit(input: EditModelProvider, authorize = () => {}) {
      return serialize(async () => {
        authorize();
        const row = snapshot().rows.get(input.id);
        if (!row) throw new ModelProviderError('provider-not-found');
        const { section, location, value } = row;
        const path = location.settingsPath;
        const previousRef = reference(value?.['apiKeyEnv']);
        fence(section, input.expectedRevision);
        const dictionary = isDictionaryRoute(location);
        if (
          (input.name !== undefined && !dictionary) ||
          (input.key !== undefined && !dictionary && previousRef === undefined)
        )
          throw new ModelProviderError('provider-unavailable');
        const ops: SettingsPathOp[] = [];
        if (input.name !== undefined)
          ops.push({ op: 'set', path: [...path, 'displayName'], value: input.name });
        if (input.key === undefined) {
          await change(section, ops);
          const modelCount = (await source.models(input.id).catch(() => [])).length;
          return {
            id: input.id,
            keyStored: (await credential(previousRef === undefined ? [] : [previousRef])).keyStored,
            modelCount,
            testReply: 'skipped' as const,
          };
        }
        await saveKey(input.key, (ref) => {
          authorize();
          return change(section, [...ops, { op: 'set', path: [...path, 'apiKeyEnv'], value: ref }]);
        });
        return test(input.id, true, await discard(previousRef));
      });
    },
    async remove(input: RemoveModelProvider, authorize = () => {}): Promise<ModelProviderRemoval> {
      return serialize(async () => {
        authorize();
        const row = snapshot().rows.get(input.id);
        if (!row) throw new ModelProviderError('provider-not-found');
        const { section, location, value } = row;
        fence(section, input.expectedRevision);
        const path = location.settingsPath;
        if (
          !isDictionaryRoute(location) ||
          at(section.user, path) === undefined ||
          at(section.base, path) !== undefined
        )
          throw new ModelProviderError('provider-inherited');
        const uses = source.uses(input.id);
        if (uses.length > 0) throw new ModelProviderError('provider-in-use', uses);
        await change(section, [{ op: 'unset', path: [...path] }]);
        return {
          id: input.id,
          ...((await discard(reference(value?.['apiKeyEnv'])))
            ? { credentialCleanupPending: true }
            : {}),
        };
      });
    },
  };
}

export type ModelProviders = ReturnType<typeof createModelProviders>;

export async function testProviderReply(
  llm: Pick<LlmRuntime, 'resolveModelInfo' | 'stream'>,
  provider: string,
  model: string,
  report: (outcome: string) => void,
): Promise<boolean> {
  const signal = AbortSignal.timeout(15_000);
  const info = await llm.resolveModelInfo(provider, model);
  const off = info.reasoning?.efforts.find((effort) => effort.id === 'off');
  let hasText = false;
  for await (const chunk of llm.stream({
    provider,
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }] }],
    ...(off === undefined ? {} : { reasoningEffort: ReasoningEffortId('off') }),
    maxTokens: 128,
    signal,
  })) {
    if (chunk.type === 'text-delta' && chunk.text.trim()) hasText = true;
    if (chunk.type === 'block-end' && chunk.block.type === 'text' && chunk.block.text.trim())
      hasText = true;
    if (chunk.type === 'finish') {
      const ok = hasText && (chunk.reason.kind === 'stop' || chunk.reason.kind === 'max-tokens');
      report(ok ? 'reply' : chunk.reason.kind);
      return ok;
    }
  }
  report('no-finish');
  return false;
}
