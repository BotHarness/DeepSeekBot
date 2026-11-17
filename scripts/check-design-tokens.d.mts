export type DesignTokenRule =
  | 'dshToken'
  | 'dshImport'
  | 'rawControl'
  | 'legacyCss'
  | 'literalColor'
  | 'inlineStyle'
  | 'lineBorder';
export type DesignTokenCounts = Record<string, Partial<Record<DesignTokenRule, number>>>;

export const BASELINE: string;
export const RULES: Readonly<
  Record<
    DesignTokenRule,
    {
      readonly pattern: RegExp;
      readonly fix: string;
      readonly outsideDs?: boolean;
      readonly exempt?: readonly string[];
      readonly when?: (source: string) => boolean;
    }
  >
>;
export function scan(dir?: string, only?: readonly string[]): DesignTokenCounts;
export function compare(current: DesignTokenCounts, baseline: DesignTokenCounts): string[];
