import type { ReactNode } from 'react';

export type ComposerShortcutId =
  | 'model'
  | 'workspace'
  | 'companion'
  | 'profile'
  | 'memory'
  | 'sessions'
  | 'settings'
  | 'sidebar';

export interface ComposerShortcut {
  id: ComposerShortcutId;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  reason?: string | undefined;
  selected?: boolean;
  run(): void;
}

export interface ComposerContext {
  target: string;
  shortcuts: readonly ComposerShortcut[];
  content: ReactNode;
}

export interface ComposerSlashQuery {
  start: number;
  end: number;
  filter: string;
}

export function composerSlashQuery(value: string, caret: number): ComposerSlashQuery | undefined {
  const match = /(?:^|\n)\/([a-z]*)$/iu.exec(value.slice(0, caret));
  if (match === null) return;
  return { start: caret - match[1]!.length - 1, end: caret, filter: match[1]!.toLowerCase() };
}

export function composerShortcutOptions(
  shortcuts: readonly ComposerShortcut[],
  query: ComposerSlashQuery | undefined,
): readonly ComposerShortcut[] {
  return query === undefined ? [] : shortcuts.filter((item) => item.id.startsWith(query.filter));
}
