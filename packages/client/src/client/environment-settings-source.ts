export interface SettingsHostChoice {
  readonly hostId: string;
  readonly hostName: string;
}

type OpenHostSettings = (host?: SettingsHostChoice) => void;

let opener: OpenHostSettings | undefined;

export function mountHostSettingsOpener(open: OpenHostSettings): () => void {
  opener = open;
  return () => {
    if (opener === open) opener = undefined;
  };
}

export function openHostSettings(host?: SettingsHostChoice): boolean {
  if (opener === undefined) return false;
  opener(host);
  return true;
}
