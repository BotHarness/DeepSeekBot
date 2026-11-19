import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

import { COMBOBOX_CSS } from '../src/client/combobox.js';
import { COMPOSER_CONTEXT_CSS } from '../src/client/composer-context-styles.js';
import { INTERNAL_TOUR_CSS } from '../src/client/internal-tour-styles.js';
import { CSS } from '../src/client/styles.js';
import { WINDOW_COMPANION_CSS } from '../src/client/window-companion-styles.js';

const source = [COMPOSER_CONTEXT_CSS, INTERNAL_TOUR_CSS, COMBOBOX_CSS, WINDOW_COMPANION_CSS].reduce(
  (sheet, included) => sheet.replace(included, ''),
  CSS,
);

const ALIAS_START = '/* @bh-brand-aliases:start';
const ALIAS_END = '/* @bh-brand-aliases:end */';
const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function aliasBounds(): { start: number; end: number } {
  const start = source.indexOf(ALIAS_START);
  const end = source.indexOf(ALIAS_END);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('styles.ts must delimit its brand alias block');
  }
  return { start, end };
}

describe('client styles', () => {
  it('uses Tobs colours in Bot-mode styles', () => {
    expect(CSS).not.toMatch(/--dsw-|--dsh-content-font-size/);
  });
  it('keeps the working indicators static while Bots stream', () => {
    expect(source).toContain(
      ".bh-row-glyph[data-status='working'] { color: var(--tobs-status-success-base); }",
    );
    expect(source).not.toMatch(
      /bh-row-glyph-spin|bh-timeline-working-dot|bh-header-working-ellipsis|bh-reading-dots/,
    );
    const rule = source.slice(source.indexOf('.bh-row-glyph {'));
    expect(rule.slice(0, rule.indexOf('}'))).not.toContain('animation');
  });
  it('pins a message group avatar to the timeline bottom edge while its group scrolls past', () => {
    expect(source).toMatch(/\.bh-message-group \{[^}]*align-items: flex-end/);
    expect(source).toMatch(/\.bh-message-group-avatar \{[^}]*position: sticky;\s*bottom: 0;/);
  });
  it('keeps mixed composer attachments in fixed-height cards on one horizontal scroll row', () => {
    expect(source).toMatch(/\.bh-composer-attachments \{[^}]*flex-wrap: nowrap/);
    expect(source).toMatch(/\.bh-composer-attachments \{[^}]*overflow-x: auto/);
    expect(source).toMatch(/\.bh-composer-attachments \{[^}]*overflow-y: hidden/);
    expect(source).toMatch(/\.bh-composer-attachment-card \{[^}]*flex: 0 0 180px/);
    expect(source).toMatch(/\.bh-composer-attachment-card \{[^}]*height: 48px/);
    expect(source).toMatch(/\.bh-composer-attachment-card \{[^}]*box-sizing: border-box/);
  });
  it('aligns the attachment reference and remove controls in matching inset boxes', () => {
    expect(source).toMatch(
      /\.bh-composer-file-reference \{[^}]*bottom: 2px; right: 2px; width: 20px; height: 20px/,
    );
    expect(source).toMatch(
      /\.bh-composer-attachment-card \.bh-composer-attachment-remove \{[^}]*top: 2px; right: 2px; width: 20px; height: 20px/,
    );
  });
  it('contains no literal colours outside the brand alias block', () => {
    const { start, end } = aliasBounds();
    const outside = `${source.slice(0, start)}${source.slice(end)}`;
    expect(outside).not.toMatch(LITERAL_COLOUR);
  });

  it('keeps the brand alias block to at most three token entries', () => {
    const { start, end } = aliasBounds();
    const block = source.slice(start, end);
    const entries = block.match(/--bh-[a-z-]+\s*:/g) ?? [];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBeLessThanOrEqual(3);
  });

  it('keeps spacing between roster rows and blocks', () => {
    expect(source).toMatch(/\.bh-list-area > \* \+ \* \{\s*margin-top: 2px/);
    expect(source).toMatch(/\.bh-section \+ \.bh-section \{\s*margin-top: 12px/);
  });
  it('fades only timeline alpha while keeping the channel island and composer outside the mask', () => {
    expect(source).toMatch(/\.bh-topbar \{[^}]*position: absolute/);
    expect(source).toMatch(
      /\.bh-channel-island:hover \{[^}]*background: color-mix\([^;]*var\(--tobs-layer-raised\)/,
    );
    expect(source).toMatch(/\.bh-channel-island-wrap \{[^}]*align-items: center/);
    expect(source).toContain(".bh-topbar[data-channel-detail='true'] { display: none; }");
    expect(source).not.toContain('.bh-chat-top-fade');
    expect(source).not.toContain('.bh-composer-activity-status::before');
    expect(source).toMatch(
      /\.bh-chat-body \{[^}]*mask-image: linear-gradient\(to bottom, transparent, black/,
    );
    expect(source).toMatch(/\.bh-chat-body \{[^}]*mask-mode: alpha/);
    expect(source).not.toMatch(/\.bh-chat-pane \{[^}]*mask-image:/);
    expect(source).not.toMatch(/\.bh-composer-shell \{[^}]*mask-image:/);
    expect(source).not.toMatch(/\.bh-topbar \{[^}]*border-bottom:/);
    expect(source).not.toMatch(/\.bh-channel-sidebar-head \{[^}]*border-bottom:/);
  });

  it('keeps the section block spacing in the roster and retires the section control overrides', () => {
    expect(source).not.toContain('bh-arrow');
    expect(source).not.toContain('bh-row-slot');
    expect(source).not.toContain('.bh-section-head {');
    expect(source).toMatch(/\.bh-section \+ \.bh-section \{\s*margin-top: 12px/);
  });

  it('carries the native channel drag insert-line recipe', () => {
    expect(source).toMatch(/\.bh-channel-row\.bh-drop-before::before/);
    expect(source).toMatch(/\.bh-channel-row\.bh-drop-after::after/);
    expect(source).toMatch(/\.bh-drop-before::before \{\s*top: -7px/);
    expect(source).toMatch(/\.bh-drop-after::after \{\s*bottom: -7px/);
  });

  it('carries the native section-block drag insert-line recipe', () => {
    expect(source).toMatch(/\.bh-section\.bh-drop-before::before/);
    expect(source).toMatch(/\.bh-section\.bh-drop-after::after/);
    expect(source).toMatch(/\.bh-section\.bh-drop-before::before \{\s*top: -8px/);
    expect(source).toMatch(/\.bh-section\.bh-drop-after::after \{\s*bottom: -8px/);
  });

  it('marks row-less section drops with an overlay line and fades the source in place', () => {
    expect(source).not.toContain('bh-empty-drop');
    expect(source).toMatch(/\.bh-section\.bh-drop-scope > \.bh-list-area::before/);
    expect(source).toMatch(
      /\.bh-section\.bh-drop-scope > \.bh-list-area::before \{[^}]*position: absolute/,
    );
    expect(source).toMatch(/\.bh-section\.bh-drop-before::before,[^{]*\{[^}]*position: absolute/);
    expect(source).toMatch(/\.bh-channel-row\.bh-drag-source \{\s*opacity: 0\.4/);
    expect(source).toMatch(/\.bh-contact\.bh-drag-source \{\s*opacity: 0\.4/);
  });

  it('collapses idle drag targets and exposes an explicit restore-position zone', () => {
    expect(source).toMatch(/\.bh-pin-zone-empty \{[^}]*min-height: 96px/);
    expect(source).toMatch(
      /\.bh-pin-zone-empty\.bh-pin-zone-hidden \{[^}]*height: 0;[^}]*opacity: 0/,
    );
    expect(source).toMatch(/\.bh-pin-zone \{[^}]*height 150ms var\(--ds-ease-in-out\)/);
    expect(source).toMatch(
      /\.bh-pin-zone-empty \{[^}]*border: 1px dashed var\(--tobs-line-strong\)/,
    );
    expect(source).toMatch(/\.bh-pin-zone-active \{[^}]*background: var\(--bh-hover\)/);
    expect(source).toMatch(
      /\.bh-unpin-zone \{[^}]*height: 72px;[^}]*border: 1px dashed var\(--tobs-line-strong\)/,
    );
    expect(source).toMatch(
      /\.bh-unpin-zone-hidden \{[^}]*height: 0;[^}]*opacity: 0;[^}]*pointer-events: none/,
    );
    expect(source).toMatch(/\.bh-unpin-zone-active \{[^}]*background: var\(--bh-hover\)/);
    expect(source).not.toContain('.bh-roster-list-unpin-target');
    expect(source).not.toContain('.bh-pinned.bh-drag-source {');
  });

  it('keeps context-menu positioning out of feature CSS', () => {
    expect(source).not.toContain('.bh-menu-anchor');
  });

  it('moves bubble copy/reply actions into the long-press menu on narrow screens', () => {
    expect(source).toMatch(
      /@media \(max-width: 640px\) \{\s*\.bh-bubble-toolbar \{\s*display: none/,
    );
  });

  it('floats bubble hover actions over the top-right edge without shifting layout', () => {
    expect(source).toMatch(
      /\.bh-bubble-toolbar \{\s*position: absolute;[^}]*bottom: calc\(100% - [^)]+\);[^}]*justify-content: safe flex-end;[^}]*opacity: 0;/,
    );
    expect(source).not.toMatch(/\.bh-bubble-toolbar \{[^}]*transform:/);
    expect(source).toMatch(
      /\.bh-message-group-me \.bh-bubble-toolbar \{\s*justify-content: flex-end;/,
    );
    expect(source).toMatch(/\.bh-bubble-toolbar:has\(\[aria-expanded='true'\]\) \{\s*opacity: 1;/);
  });

  it('keeps the retired rail divider and row rules out of legacy CSS', () => {
    expect(source).not.toContain('.bh-rail-channel {');
    expect(source).not.toContain('.bh-rail-divider');
  });

  it('leaves hidden Channel layout to the shared dialog and its token styles', () => {
    expect(source).not.toContain('.bh-hidden-manager');
    expect(source).not.toContain('.bh-hidden-search');
    expect(source).not.toContain('.bh-hidden-row');
  });

  it('copies the native rename input box model without portaled overrides', () => {
    expect(source).toMatch(/\.bh-name-input \{[^}]*box-sizing: border-box/);
    expect(source).toMatch(/\.bh-name-input \{[^}]*height: 44px/);
    expect(source).toMatch(/\.bh-name-input \{[^}]*padding: 7px 14px/);
    expect(source).toMatch(/\.bh-name-input \{[^}]*border-radius: 22px/);
    expect(source).not.toContain('bh-modal-input');
  });

  it('uses the shared product motion boundary instead of component media queries', () => {
    expect(source).not.toContain('prefers-reduced-motion');
    expect(source).not.toContain(".bh-persona-avatar[data-active='true']::before");
    expect(source).not.toMatch(/@keyframes bh-avatar-(breathe|work|search|code|execute)\b/);
    expect(source).not.toContain('.bh-avatar-botui');
    expect(source).not.toContain('--botui-anim');
    expect(source).not.toContain('.bh-motion-preview');
  });

  it('keeps the composer island token-driven and clear of the message scroll area', () => {
    const chrome = readFileSync(
      new URL('../src/client/ds/chat-chrome.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toMatch(/\.bh-composer \{[^}]*min-height: 50px/);
    expect(source).toContain(
      '.bh-composer-rich-input:not(:has(> br[data-rich-placeholder]:last-child))::after',
    );
    expect(chrome).toContain('borderRadius: style.radiusComposer');
    expect(source).toMatch(/\.bh-composer \{[^}]*--bh-composer-footer-padding: 10px 12px 48px/);
    expect(source).toMatch(/\.bh-composer \{[^}]*padding: var\(--bh-composer-padding,/);
    expect(source).toMatch(/\.bh-composer \{[^}]*transition:\s*padding 180ms var\(--bh-ease-out\)/);
    expect(chrome).toMatch(
      /control: \{[^}]*width: size.controlLarge,[^}]*height: size.controlLarge,[^}]*borderRadius: radius.full/,
    );
    expect(chrome).toContain('light-dark(${layer.raised}, ${layer.elevated})');
    expect(chrome).toContain('boxShadow: elevation.x1');
    expect(source).toMatch(/\.bh-composer-shell \{[^}]*safe-area-inset-bottom/);
    expect(source).not.toContain('.bh-composer-activity');
    expect(source).toMatch(/\.bh-composer-input \{[^}]*max-height: 144px/);
    expect(source).toMatch(/\.bh-composer-input \{[^}]*padding: 7px 8px 5px/);
    expect(source).not.toMatch(/\.bh-composer-input \{[^}]*transition:/);
    expect(source).toMatch(/\.bh-composer-body \{[^}]*height: var\(--bh-composer-body-height\)/);
    expect(source).not.toMatch(/\n\.bh-composer-body \{[^}]*transition:/);
    expect(source).not.toMatch(/\n\.bh-chat-body \{[^}]*transition:/);
    expect(source).toMatch(
      /\.bh-composer-first-expand \.bh-composer-body \{[^}]*transition: height 180ms/,
    );
    expect(chrome).toMatch(/attachment: \{[^}]*position: 'absolute',[^}]*bottom: '9px'/);
    expect(source).toMatch(/\.bh-composer-footer \{[^}]*bottom: 9px/);
    expect(source).not.toMatch(/\n\.bh-composer-add-file \{[^}]*transition:/);
    expect(source).not.toMatch(/\n\.bh-composer-footer \{[^}]*transition:/);
    expect(source).toContain("html[data-botharness-motion='reduce'] .bh-composer-add-file");
    expect(source).toContain("html[data-botharness-motion='reduce'] .bh-composer-footer");
    expect(source).toContain("html[data-botharness-motion='reduce'] .bh-composer-body");
  });
});
