import type { ReactNode } from 'react';

export type ComposerShortcutId =
  | 'footer'
  | 'model'
  | 'effort'
  | 'workspace'
  | 'companion'
  | 'profile'
  | 'memory'
  | 'sessions'
  | 'compact'
  | 'settings'
  | 'sidebar';

export interface ComposerShortcut {
  id: ComposerShortcutId;
  key?: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  reason?: string | undefined;
  scope?: string;
  selected?: boolean;
  run(): void;
  choices?(argument: string): readonly ComposerShortcut[];
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
  argument?: string;
}

export function composerSlashQuery(value: string, caret: number): ComposerSlashQuery | undefined {
  const before = value.slice(0, caret);
  const command = /(?:^|\n)\/([a-z]*)$/iu.exec(before);
  if (command !== null)
    return {
      start: caret - command[1]!.length - 1,
      end: caret,
      filter: command[1]!.toLowerCase(),
    };
  const argument = /(?:^|\n)\/([a-z]+) ([^\n]*)$/iu.exec(before);
  if (argument === null) return;
  return {
    start: caret - argument[2]!.length - argument[1]!.length - 2,
    end: caret,
    filter: argument[1]!.toLowerCase(),
    argument: argument[2]!,
  };
}

export function composerShortcutOptions(
  shortcuts: readonly ComposerShortcut[],
  query: ComposerSlashQuery | undefined,
): readonly ComposerShortcut[] {
  if (query === undefined) return [];
  if (query.argument !== undefined) {
    const shortcut = shortcuts.find((item) => item.id === query.filter);
    return shortcut?.choices?.(query.argument) ?? [];
  }
  return shortcuts.filter((item) => item.id.startsWith(query.filter));
}
