import type { ComponentType } from 'react';

export interface DockPanelChannel {
  readonly id: string;
  readonly type: 'dm' | 'group';
  readonly botSlug: string | undefined;
}
export interface DockPanelProps {
  readonly channel: DockPanelChannel | undefined;
  readonly botId?: string | undefined;
  readonly instanceId?: string | undefined;
}
export interface DockPanel {
  readonly id: string;
  readonly title: string;
  readonly icon?: string | undefined;
  readonly scope: 'global' | 'channel';
  readonly binding?: 'current-bot' | undefined;
  readonly order?: number | undefined;
  readonly defaultPosition?:
    | {
        readonly zone: 'left' | 'center' | 'right' | 'bottom';
        readonly relativeTo?: string | undefined;
      }
    | undefined;
  readonly component: ComponentType<DockPanelProps>;
  readonly headerAction?: ComponentType<DockPanelProps> | undefined;
}
export interface DockPanelInstance {
  readonly id: string;
  readonly definitionId: string;
  readonly botId: string;
  readonly label: string;
}
export interface DockPanelRegistry {
  register(panel: DockPanel): () => void;
  panels(): readonly DockPanel[];
  instances(): readonly DockPanelInstance[];
  createInstance(definitionId: string, botId: string, label: string): string;
  removeInstance(id: string): void;
  openPanels(): readonly string[];
  available(): boolean;
  canOpen?(id: string): boolean;
  isOpen(id: string): boolean;
  open(id: string): void;
  close(id: string): void;
  toggle(id: string): void;
  subscribe(listener: () => void): () => void;
}

export interface BotPresentationSnapshot {
  readonly botId: string;
  readonly name: string;
  readonly available: boolean;
  readonly paused: boolean;
  readonly sync: 'connecting' | 'live' | 'stale';
  readonly activity: 'idle' | 'thinking' | 'working' | 'waiting' | 'blocked';
  readonly attention?: string | undefined;
  readonly text: string;
  readonly page: string;
  readonly speaking: boolean;
  readonly conversing: boolean;
  readonly mouth: number;
  readonly inbox: number;
}
export interface BotPresentationView {
  getSnapshot(): BotPresentationSnapshot;
  subscribe(listener: () => void | Promise<void>): () => void;
  dispose(): void;
}
export interface BotPresentation {
  acquire(botId: string): BotPresentationView;
  bots(): readonly { id: string; name: string }[];
}
export interface PanelServices {
  botPresentation: BotPresentation;
  dockPanels: DockPanelRegistry;
}
