export interface TokenLeaf {
  readonly path: readonly string[];
  readonly type: string;
  readonly light: unknown;
  readonly dark: unknown;
}

export interface WebTokens {
  readonly leaves: readonly TokenLeaf[];
  readonly light: Readonly<Record<string, unknown>>;
  readonly dark: Readonly<Record<string, unknown>>;
  readonly accents: Readonly<Record<string, { light: string; dark: string }>>;
  readonly breakpoints: Readonly<Record<string, string>>;
}

export const SOURCE: string;
export const CSS_OUTPUT: string;
export const STYLEX_OUTPUT: string;
export function readTokens(path?: string): unknown;
export function flatten(tree: unknown): TokenLeaf[];
export function cssName(path: readonly string[]): string;
export function webTokens(tree?: unknown): WebTokens;
export function renderCss(tokens?: WebTokens): string;
export function renderStylex(tokens?: WebTokens): string;
export function contrast(foreground: string, background: string, backdrop?: string): number;
