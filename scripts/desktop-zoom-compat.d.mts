export interface DesktopZoomThemeProvenance {
  adapterVersion: number;
  sourceVersion: string;
  clientBefore: string;
  clientAfter: string;
  hostBefore: string;
  sourceModified: boolean;
  platforms: string[];
  changes: string[];
}
export const ZOOM_THEME_VERSION: '0.2.1-rc.2';
export const ZOOM_THEME_HASHES: { client: string; host: string };
export function adaptZoomTheme(client: string): string;
export function prepareDesktopZoomCompatibility(options: {
  source: string;
  target: string;
  schemaModule?: string;
}): DesktopZoomThemeProvenance;
export function preparePackagedDesktopZoomTheme(options: {
  source: string;
  target: string;
}): DesktopZoomThemeProvenance;
