import type { HostClient } from '../../host/client';

type Section = { id: string; name: string };
export type SectionState = {
  busy: boolean;
  selected?: Section;
  error?: 'create' | 'assign' | 'refresh' | 'changed' | undefined;
  complete: boolean;
};

export function createSectionFlow(
  client: Pick<HostClient, 'call' | 'refresh'>,
  channelId: string,
  isCurrent: () => boolean,
) {
  let state: SectionState = { busy: false, complete: false };
  const listeners = new Set<() => void>();
  const publish = (next: SectionState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const current = () => {
    if (!isCurrent()) throw Error('changed Host');
  };
  const run = async (section?: Section, name?: string) => {
    if (state.busy || (name !== undefined && name.trim() === '')) return;
    let phase: NonNullable<SectionState['error']> = name === undefined ? 'assign' : 'create';
    publish({
      ...state,
      ...(section ? { selected: section, complete: false } : {}),
      busy: true,
      error: undefined,
    });
    try {
      current();
      let selected = section ?? state.selected;
      if (name !== undefined) {
        const result = await client.call<{ section: Section }>('sectionCreate', {
          name: name.trim(),
        });
        if (!result.section?.id || typeof result.section.name !== 'string')
          throw Error('invalid section');
        selected = result.section;
        publish({ busy: true, complete: false, selected });
      }
      current();
      if (!selected) return;
      publish({ ...state, selected });
      if (!state.complete || section !== undefined) {
        phase = 'assign';
        await client.call('channelAssign', { channelId, sectionId: selected.id });
        publish({ ...state, complete: true });
      }
      current();
      phase = 'refresh';
      await client.refresh();
      current();
    } catch {
      publish({ ...state, error: isCurrent() ? phase : 'changed' });
    } finally {
      publish({ ...state, busy: false });
    }
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    choose: (section: Section) => run(section),
    create: (name: string) => run(undefined, name),
    retry: () => run(),
    reset() {
      if (!state.busy) publish({ busy: false, complete: false });
    },
  };
}
