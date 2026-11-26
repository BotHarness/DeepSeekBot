export interface SettingsHostChoice {
  readonly hostId: string;
  readonly hostName: string;
}

type OpenHostSettings = (host?: SettingsHostChoice) => void;

let opener: OpenHostSettings | undefined;

export function mountHostSettingsOpener(
  open: OpenHostSettings,
  openSection?: (sectionId: string) => void,
): () => void {
  opener = open;
  const unmountSection =
    openSection === undefined ? undefined : mountSettingsSectionOpener(openSection);
  return () => {
    if (opener === open) opener = undefined;
    unmountSection?.();
  };
}

export function openHostSettings(host?: SettingsHostChoice): boolean {
  if (opener === undefined) return false;
  opener(host);
  return true;
}

type OpenSettingsSection = (sectionId: string) => void;

let sectionOpener: OpenSettingsSection | undefined;

export function mountSettingsSectionOpener(open: OpenSettingsSection): () => void {
  sectionOpener = open;
  return () => {
    if (sectionOpener === open) sectionOpener = undefined;
  };
}

export function openSettingsSection(sectionId: string): boolean {
  if (sectionOpener === undefined) return false;
  sectionOpener(sectionId);
  return true;
}
