import type { Plugin } from 'vite';

export declare const DOCKVIEW_CSS_PLACEHOLDER: string;
export declare function dockviewStructuralCss(rootDir: string): string;
export declare function dockviewCssPlugin(options: { rootDir: string }): Plugin;
