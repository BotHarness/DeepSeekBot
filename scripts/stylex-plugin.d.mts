import type { Plugin } from 'vite';

export declare const STYLEX_CSS_PLACEHOLDER: string;
export declare function stylexOptions(rootDir: string): Record<string, unknown>;
export declare function stylexCss(rules: readonly unknown[]): string;
export declare function stylexPlugin(options: { rootDir: string }): Plugin;
