import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';

const HEX = '[0-9a-f]';
const UUID = `${HEX}{8}-${HEX}{4}-${HEX}{4}-${HEX}{4}-${HEX}{12}`;
const ID_PATTERN = new RegExp(
  `(?<![\\w/\\\\.-])((?:[a-z][a-z0-9]*-)*)(${UUID}|${HEX}{32})(?![\\w/\\\\-]|\\.\\w)`,
  'g',
);
const ALIAS_PATTERN = /(?<![\w-])(dm|[egmacr])([1-9]\d{0,8})(?![\w-])/g;
const WHOLE_ALIAS = /^(dm|[egmacr])([1-9]\d{0,8})$/;

export type LocalRefPrefix = 'e' | 'm' | 'dm' | 'g' | 'c' | 'a' | 'r';

export function localRefPrefix(prefix: string): LocalRefPrefix | undefined {
  if (prefix === '') return 'e';
  if (prefix === 'bot-') return undefined;
  if (prefix.startsWith('dm-')) return 'dm';
  if (prefix === 'group-') return 'g';
  if (prefix === 'human-') return 'm';
  if (prefix === 'botharness-') return 'a';
  return 'r';
}

export interface LocalRefStore {
  load(botSlug: string): LocalRefSnapshot | undefined;
  save(botSlug: string, snapshot: LocalRefSnapshot): void;
}

export interface LocalRefSnapshot {
  readonly version: 1;
  readonly refs: Record<string, string>;
}

class BotRefs {
  readonly #byId = new Map<string, string>();
  readonly #byAlias = new Map<string, string>();
  readonly #next = new Map<string, number>();

  constructor(snapshot: LocalRefSnapshot | undefined) {
    for (const [alias, id] of Object.entries(snapshot?.refs ?? {})) this.#remember(alias, id);
  }

  #remember(alias: string, id: string): void {
    const match = WHOLE_ALIAS.exec(alias);
    if (match === null) return;
    this.#byAlias.set(alias, id);
    this.#byId.set(id, alias);
    const ordinal = Number(match[2]);
    if (ordinal >= (this.#next.get(match[1]!) ?? 1)) this.#next.set(match[1]!, ordinal + 1);
  }

  alias(prefix: LocalRefPrefix, id: string): { alias: string; created: boolean } {
    const known = this.#byId.get(id);
    if (known !== undefined) return { alias: known, created: false };
    const alias = `${prefix}${this.#next.get(prefix) ?? 1}`;
    this.#remember(alias, id);
    return { alias, created: true };
  }

  resolve(alias: string): string | undefined {
    return this.#byAlias.get(alias);
  }

  snapshot(): LocalRefSnapshot {
    return { version: 1, refs: Object.fromEntries(this.#byAlias) };
  }
}

export class LocalRefs {
  readonly #store: LocalRefStore;
  readonly #bots = new Map<string, BotRefs>();

  constructor(store: LocalRefStore) {
    this.#store = store;
  }

  #bot(botSlug: string): BotRefs {
    let refs = this.#bots.get(botSlug);
    if (refs === undefined) {
      refs = new BotRefs(this.#store.load(botSlug));
      this.#bots.set(botSlug, refs);
    }
    return refs;
  }

  encode(botSlug: string, text: string): string {
    const refs = this.#bot(botSlug);
    let changed = false;
    const out = text.replace(ID_PATTERN, (whole, prefix: string, id: string) => {
      const kind = localRefPrefix(prefix);
      if (kind === undefined) return whole;
      const next = refs.alias(kind, `${prefix}${id}`);
      changed ||= next.created;
      return next.alias;
    });
    if (changed) this.#store.save(botSlug, refs.snapshot());
    return out;
  }

  resolve(botSlug: string, value: string): string {
    return WHOLE_ALIAS.test(value) ? (this.#bot(botSlug).resolve(value) ?? value) : value;
  }

  expand(botSlug: string, text: string): string {
    const refs = this.#bot(botSlug);
    return text.replace(ALIAS_PATTERN, (whole) => refs.resolve(whole) ?? whole);
  }

  decodeArgs(botSlug: string, args: unknown, expandFields: ReadonlySet<string>): unknown {
    const walk = (value: unknown, key: string | undefined): unknown => {
      if (typeof value === 'string')
        return key !== undefined && expandFields.has(key)
          ? this.expand(botSlug, value)
          : this.resolve(botSlug, value);
      if (Array.isArray(value)) return value.map((item) => walk(item, key));
      if (value !== null && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, walk(v, k)]),
        );
      return value;
    };
    return walk(args, undefined);
  }

  encodeBlocks(botSlug: string, blocks: readonly ContentBlock[]): ContentBlock[] {
    return blocks.map((block) =>
      block.type === 'text' ? { ...block, text: this.encode(botSlug, block.text) } : block,
    );
  }
}

const FORWARDED_TEXT_FIELDS = new Set(['instructions', 'description', 'message', 'prompt', 'note']);

export function withLocalRefs(
  tool: ToolDefinition,
  refs: LocalRefs,
  botSlug: string,
): ToolDefinition {
  const finalize = tool.finalizeContent?.bind(tool);
  return {
    ...tool,
    execute: (args, exec) =>
      tool.execute(refs.decodeArgs(botSlug, args, FORWARDED_TEXT_FIELDS), exec),
    finalizeContent: (exec, result) =>
      refs.encodeBlocks(botSlug, finalize?.(exec, result) ?? result.content),
  };
}

export function fileLocalRefStore(pathFor: (botSlug: string) => string): LocalRefStore {
  return {
    load(botSlug) {
      try {
        const parsed = JSON.parse(readFileSync(pathFor(botSlug), 'utf8')) as LocalRefSnapshot;
        return parsed.version === 1 ? parsed : undefined;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
    },
    save(botSlug, snapshot) {
      const path = pathFor(botSlug);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(`${path}.tmp`, JSON.stringify(snapshot));
      renameSync(`${path}.tmp`, path);
    },
  };
}

export function localRefsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['BOTHARNESS_SHORT_REFS'] === '1';
}
