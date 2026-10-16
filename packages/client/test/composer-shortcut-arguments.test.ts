import { describe, expect, it } from 'vitest';
import {
  composerShortcutOptions,
  composerSlashQuery,
  type ComposerShortcut,
} from '../src/client/composer-shortcuts.js';

const shortcut = (
  id: ComposerShortcut['id'],
  label: string,
  choices?: ComposerShortcut['choices'],
) => ({ id, label, run() {}, ...(choices === undefined ? {} : { choices }) }) as ComposerShortcut;

describe('composer slash arguments', () => {
  it('recognizes a command with one space and an argument up to the caret', () => {
    expect(composerSlashQuery('/model flash', 12)).toEqual({
      start: 0,
      end: 12,
      filter: 'model',
      argument: 'flash',
    });
    expect(composerSlashQuery('draft\n/effort high now', 22)).toEqual({
      start: 6,
      end: 22,
      filter: 'effort',
      argument: 'high now',
    });
    expect(composerSlashQuery('/model ', 7)).toEqual({
      start: 0,
      end: 7,
      filter: 'model',
      argument: '',
    });
  });

  it('keeps the letters-only and prose behaviors unchanged', () => {
    expect(composerSlashQuery('/mod', 4)).toEqual({ start: 0, end: 4, filter: 'mod' });
    expect(composerSlashQuery('a /model', 8)).toBeUndefined();
    expect(composerSlashQuery('/model\nnext', 11)).toBeUndefined();
  });
});

describe('composer shortcut argument choices', () => {
  const shortcuts = [
    shortcut('model', 'Model', (argument) => [shortcut('model', `choice:${argument}`)]),
    shortcut('workspace', 'Workspace'),
  ];

  it('returns the matching command choices for an argument query', () => {
    const options = composerShortcutOptions(shortcuts, composerSlashQuery('/model flash', 12));
    expect(options).toHaveLength(1);
    expect(options[0]!.label).toBe('choice:flash');
  });

  it('ignores an argument query for a command without choices and keeps prefix filtering', () => {
    expect(composerShortcutOptions(shortcuts, composerSlashQuery('/workspace x', 12))).toHaveLength(
      0,
    );
    expect(composerShortcutOptions(shortcuts, composerSlashQuery('/mod', 4))).toHaveLength(1);
    expect(composerShortcutOptions(shortcuts, composerSlashQuery('/nomatch', 8))).toHaveLength(0);
  });
});
