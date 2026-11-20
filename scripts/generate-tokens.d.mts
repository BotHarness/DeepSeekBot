export interface ResolverInput {
  readonly mode?: string;
  readonly style?: string;
  readonly accent?: string;
}

export interface Resolver {
  readonly order: readonly { kind: 'sets' | 'modifiers'; name: string }[];
  readonly sets: Readonly<Record<string, readonly unknown[]>>;
  readonly modifiers: Readonly<
    Record<string, { default: string; contexts: Readonly<Record<string, readonly unknown[]>> }>
  >;
}

export interface TokenLeaf {
  readonly path: readonly string[];
  readonly type: string;
  readonly raw: unknown;
  readonly alias: string | undefined;
  readonly value: string;
}

type Scheme = Readonly<Record<string, string>>;

export interface WebTokens {
  readonly leaves: readonly TokenLeaf[];
  readonly defaults: Readonly<Record<string, string>>;
  readonly schemes: Readonly<Record<string, Scheme>>;
  readonly accents: Readonly<Record<string, { light: string; dark: string }>>;
  readonly accentSets: Readonly<Record<string, Readonly<Record<string, Scheme>>>>;
  readonly styles: Readonly<Record<string, Scheme>>;
  readonly breakpoints: Readonly<Record<string, string>>;
}

export const RESOLVER: string;
export const CSS_OUTPUT: string;
export const STYLEX_OUTPUT: string;
export const ACCENT_ROLES: readonly string[];
export function readResolver(path?: string): Resolver;
export function resolveTree(input: ResolverInput, resolver?: Resolver): unknown;
export function resolveTokens(input?: ResolverInput, resolver?: Resolver): TokenLeaf[];
export function accentRoles(
  seed: string,
  mode: string,
  layers: Readonly<Record<string, string>>,
): Record<string, string>;
export function mix(top: string, under: string, amount: number): string;
export function cssName(path: readonly string[]): string;
export function webTokens(resolver?: Resolver): WebTokens;
export function renderCss(tokens?: WebTokens): string;
export function renderStylex(tokens?: WebTokens): string;
export function contrast(foreground: string, background: string, backdrop?: string): number;
