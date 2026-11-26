export interface SettingsHostChoice {
  readonly hostId: string;
  readonly hostName: string;
}

type OpenHostSettings = (host?: SettingsHostChoice) => void;

let opener: OpenHostSettings | undefined;
let sectionOpener: ((sectionId: string) => void) | undefined;

export function mountHostSettingsOpener(settings: {
  readonly openHost: OpenHostSettings;
  readonly open: (sectionId: string) => void;
}): () => void {
  const open = settings.openHost;
  const section = (sectionId: string): void => settings.open(sectionId);
  opener = open;
  sectionOpener = section;
  return () => {
    if (opener === open) opener = undefined;
    if (sectionOpener === section) sectionOpener = undefined;
  };
}

export function openHostSettings(host?: SettingsHostChoice): boolean {
  if (opener === undefined) return false;
  opener(host);
  return true;
}

export function canOpenSettingsSection(): boolean {
  return sectionOpener !== undefined;
}

export function openSettingsSection(sectionId: string): boolean {
  if (sectionOpener === undefined) return false;
  sectionOpener(sectionId);
  return true;
}
