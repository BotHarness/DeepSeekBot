import { describe, it, expect } from 'vitest';
import {
  defaultFooterPreferences,
  moveFooterItem,
  parseFooterPreferences,
  toggleFooterItem,
} from '../src/client/composer-footer-preferences.js';

describe('composer footer preferences', () => {
  it('keeps speed opt-in and rejects damaged or incomplete settings', () => {
    for (const raw of [
      null,
      '{}',
      '{',
      JSON.stringify({ left: ['model', 'model'], right: ['usage'], hidden: ['avg-perf'] }),
    ])
      expect(parseFooterPreferences(raw)).toEqual({
        left: ['model', 'workspace'],
        right: ['usage'],
        hidden: ['avg-perf'],
      });
  });
  it('moves between sides at an explicit insertion point without duplicating items', () => {
    let p = toggleFooterItem(defaultFooterPreferences(), 'avg-perf');
    p = moveFooterItem(p, 'avg-perf', 'right', 'usage');
    expect(p).toEqual({ left: ['model', 'workspace'], right: ['avg-perf', 'usage'], hidden: [] });
    p = moveFooterItem(p, 'workspace', 'left', 'model');
    expect(p.left).toEqual(['workspace', 'model']);
    expect(parseFooterPreferences(JSON.stringify(p))).toEqual(p);
    expect(moveFooterItem(p, 'model', 'left', 'model')).toBe(p);
  });
  it('lets all items be hidden and restores a hidden item exactly once', () => {
    let p = defaultFooterPreferences();
    for (const id of ['model', 'workspace', 'usage'] as const) p = toggleFooterItem(p, id);
    expect(p.left).toEqual([]);
    expect(p.right).toEqual([]);
    p = toggleFooterItem(p, 'usage');
    expect(p.right).toEqual(['usage']);
    expect(p.hidden).not.toContain('usage');
  });
});
