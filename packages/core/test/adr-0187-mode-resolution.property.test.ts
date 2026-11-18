import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveBotMode } from '../src/runtime/bot-mode-settings.js';

const MODES = ['deepseekbot', 'standard', 'minimal', 'ptc', 'acp', 'research'];
const mode = fc.constantFrom(...MODES);
const template = fc.uniqueArray(mode, { minLength: 1, maxLength: MODES.length });
const installed = fc.option(
  fc.uniqueArray(mode, { maxLength: MODES.length }).map((ids) => new Set(ids)),
  { nil: undefined },
);

describe('ADR-0187 mode resolution', () => {
  it('keeps a Bot that follows the default inside its template', () => {
    fc.assert(
      fc.property(template, mode, installed, (allowed, inherited, ids) => {
        expect(allowed).toContain(
          resolveBotMode({ own: undefined, inherited, allowed, installed: ids }),
        );
      }),
    );
  });

  it('picks an installed template mode whenever the template has one', () => {
    fc.assert(
      fc.property(template, mode, installed, (allowed, inherited, ids) => {
        fc.pre(ids === undefined || allowed.some((id) => ids.has(id)));
        const resolved = resolveBotMode({ own: undefined, inherited, allowed, installed: ids });
        expect(allowed).toContain(resolved);
        if (ids !== undefined) expect(ids.has(resolved)).toBe(true);
      }),
    );
  });

  it('keeps the Bot’s own mode and the inherited mode without a template', () => {
    fc.assert(
      fc.property(fc.option(mode, { nil: undefined }), mode, installed, (own, inherited, ids) => {
        expect(resolveBotMode({ own, inherited, allowed: undefined, installed: ids })).toBe(
          own ?? inherited,
        );
      }),
    );
  });
});
