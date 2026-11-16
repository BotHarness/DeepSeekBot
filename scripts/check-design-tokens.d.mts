export type DesignTokenRule = 'dshToken' | 'dshImport' | 'rawControl';
export type DesignTokenCounts = Record<string, Partial<Record<DesignTokenRule, number>>>;

export const BASELINE: string;
export const RULES: Readonly<
  Record<
    DesignTokenRule,
    { readonly pattern: RegExp; readonly fix: string; readonly outsideDs?: boolean }
  >
>;
export function scan(dir?: string): DesignTokenCounts;
export function compare(current: DesignTokenCounts, baseline: DesignTokenCounts): string[];
