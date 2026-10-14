type Palette = Record<'light' | 'dark', Record<string, string>>;

export const ROLES: Record<string, string>;
export function palette(source?: string): Palette;
export function render(colors?: Palette, version?: string): string;
