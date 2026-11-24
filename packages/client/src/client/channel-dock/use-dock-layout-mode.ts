import { WorkspaceContext } from '../workspace-context.js';
import { useContext, useRef, useState } from 'react';
import { readLayoutMode, writeLayoutMode, type SimpleLayout } from '../layout-mode.js';
import type { ChannelDockProps } from '../channel-dock.js';

export function useDockLayoutMode({ storage }: Pick<ChannelDockProps, 'storage'>) {
  const workspace = useContext(WorkspaceContext);
  const [layoutMode, updateLayoutMode] = useState<SimpleLayout>(() => {
    const value = readLayoutMode(storage);
    if (workspace) writeLayoutMode(value, storage);
    return value;
  });
  const simpleRef = useRef(layoutMode);
  const isSimple = (): boolean => workspace !== undefined && simpleRef.current.mode === 'simple';
  const sideSizedAt = useRef(0);
  const setSimpleLayout = (next: SimpleLayout): void => {
    simpleRef.current = next;
    updateLayoutMode(next);
    writeLayoutMode(next, storage);
  };

  return { workspace, layoutMode, simpleRef, isSimple, setSimpleLayout, sideSizedAt };
}
