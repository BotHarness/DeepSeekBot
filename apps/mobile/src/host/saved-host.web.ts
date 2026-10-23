import { parseSavedHosts, serializeSavedHost, type SavedHosts } from './hosts';

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
  const storage = store();
  if (!storage) throw new Error('storage-unavailable');
  if (state.hosts.length === 0) storage.removeItem(KEY);
  else
    storage.setItem(KEY, JSON.stringify({ ...state, hosts: state.hosts.map(serializeSavedHost) }));
  storage.removeItem(SINGLE_KEY);
}
