import { parseSavedHosts, type SavedHosts } from './hosts';

export type { SavedHost, SavedHosts } from './hosts';

const KEY = 'deepseekbot.hosts.v3';
const SINGLE_KEY = 'deepseekbot.host.v2';

function store(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export async function loadSavedHosts(): Promise<SavedHosts> {
  return parseSavedHosts(store()?.getItem(KEY), store()?.getItem(SINGLE_KEY));
}

export async function saveHosts(state: SavedHosts): Promise<void> {
  if (state.hosts.length === 0) store()?.removeItem(KEY);
  else store()?.setItem(KEY, JSON.stringify(state));
  store()?.removeItem(SINGLE_KEY);
}
