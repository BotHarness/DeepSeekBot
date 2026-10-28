import type { Shortcuts } from '@deepseek-ai/dsh-client-shortcuts/client';
import { createContext, type ReactNode } from 'react';
import type { DockviewApi } from 'dockview-react';
import type { TobModeControl } from './tob-mode.js';

export const TOB_MODE_SLOT = 'bh:home';
export const WORKSPACE_RAIL = 'bh:workspace-rail';
export const WORKSPACE_CHANNELS = 'bh:channels';
export const WorkspaceContext = createContext<
  | {
      shortcuts?: Shortcuts | undefined;
      tob?:
        | {
            channel(): Promise<string>;
            openChannel(channelId: string): Promise<void> | void;
            control?: TobModeControl | undefined;
          }
        | undefined;
      rail(
        api: DockviewApi,
        gap: number,
        setGap: (gap: number) => void,
        reset: () => void,
        order: readonly string[],
        setOrder: (ids: readonly string[]) => void,
        hiddenControls: readonly string[],
        setControlVisible: (id: string, visible: boolean) => void,
        layoutMode: { mode: 'simple' | 'advanced'; setMode(mode: 'simple' | 'advanced'): void },
        tobMode?: { active: boolean; setActive(active: boolean): void },
      ): ReactNode;
    }
  | undefined
>(undefined);
