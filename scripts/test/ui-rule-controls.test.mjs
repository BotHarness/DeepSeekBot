import { describe, expect, it } from 'vitest';
import { parseSource, walk } from '../check-ui-rules.mjs';
import { desktopControls, fixDesktopIcons } from '../ui-rule-controls.mjs';

const feature = 'packages/client/src/client/feature.tsx';
const designSystem = 'packages/client/src/client/ds/control.tsx';
const scan = (source, file = feature) =>
  desktopControls(source, file, parseSource(source, file), walk);
const fix = (source) => fixDesktopIcons(source, feature, parseSource(source, feature));

describe('G1 rule 3', () => {
  it('rejects feature SVG, the internal renderer, and DSH icon imports', () => {
    const source = `
import { IconSearchOutlineRegular as Search, type IconProps } from '@deepseek-ai/dsh-client-ui-primitives';
import { ChannelSidebarIcon as Glyph } from './channel-sidebar-icon.js';
const view = <><Search /><Glyph /><svg aria-hidden="true" /></>;
`;
    expect(scan(source).map(({ rule, text }) => [rule, text])).toEqual([
      ['iconSource', 'IconSearchOutlineRegular'],
      ['iconSource', 'ChannelSidebarIcon'],
      ['iconSource', '<svg>'],
    ]);
  });

  it('rewrites mapped JSX and preserves other bindings, props, and aliases', () => {
    const source = `
import { Button, IconSearchOutlineRegular as Search } from '@deepseek-ai/dsh-client-ui-primitives';
import { Icon as Glyph } from './ds/icon.js';
const view = <Search size={size} className={styles.icon} />;
`;
    const result = fix(source);
    expect(result).toContain("import { Button } from '@deepseek-ai/dsh-client-ui-primitives'");
    expect(result).toContain('<Glyph name="search" size={size} className={styles.icon} />');
    expect(scan(result)).toEqual([]);
  });

  it('leaves first-class uses, unmapped icons, and unknown forwarded props for review', () => {
    const source = `
import { IconSearchOutlineRegular as Search, IconNewChatOutlineRegular as Chat } from '@deepseek-ai/dsh-client-ui-primitives';
const view = <><Search {...props} /><Chat /></>;
const component = Search;
`;
    expect(fix(source)).toBe(source);
    expect(scan(source)).toHaveLength(2);
  });
});

describe('G1 rule 4', () => {
  it('requires a name for icon-only controls and a label for meaningful dots', () => {
    const source = `
import { IconButton as Control } from './ds/icon-button.js';
const view = <>
  <Control aria-label="" />
  <Button icon={<Icon name="search" />} />
  <button><span aria-hidden="true"><Icon name="x" /></span></button>
  <NavItem iconOnly attention={true} />
  <StatusDot />
</>;
`;
    expect(scan(source).map(({ rule, text }) => [rule, text])).toEqual([
      ['accessibleName', 'IconButton'],
      ['accessibleName', 'Button'],
      ['accessibleName', 'button'],
      ['accessibleName', 'NavItem'],
      ['statusLabel', 'NavItem.attention'],
      ['statusLabel', 'StatusDot'],
    ]);
  });

  it('accepts visible names, labelled controls and dots, and decorative dot markers', () => {
    const source = `
const view = <>
  <Button icon={<Icon name="search" />}>{t('search')}</Button>
  <IconButton aria-labelledby={heading}><Icon name="x" /></IconButton>
  <NavItem iconOnly aria-label={t('settings')} attention={attentionLabel} />
  <StatusDot label={statusText} />
  <span data-status-dot="" aria-hidden />
</>;
`;
    expect(scan(source)).toEqual([]);
  });
});

describe('G1 rule 5', () => {
  it('checks the styles applied to each native or Base UI control', () => {
    const source = `
import { Menu as BaseMenu } from '@base-ui/react/menu';
const styles = stylex.create({
  complete: { outline: { default: 'none', ':focus-visible': ring },
    opacity: { default: 1, '[data-disabled]': 0.5 } },
  unrelated: { color: color.base },
  focusOnly: { outline: { default: 'none', ':focus-visible': ring } },
});
const applied = stylex.props(styles.complete);
const view = <>
  <button {...applied}>{label}</button>
  <BaseMenu.Trigger {...stylex.props(styles.unrelated)}>{label}</BaseMenu.Trigger>
  <button {...stylex.props(styles.focusOnly)}>{label}</button>
  <input type="hidden" value={value} />
</>;
`;
    expect(scan(source, designSystem).map(({ rule, text }) => [rule, text])).toEqual([
      ['focusVisible', 'BaseMenu.Trigger'],
      ['disabledStyle', 'BaseMenu.Trigger'],
      ['disabledStyle', 'button'],
    ]);
  });

  it('accepts visible focus and disabled styles through the referenced StyleX block', () => {
    const source = `
const styles = stylex.create({ button: {
  opacity: { default: 1, ':disabled': 0.5 },
  outline: { default: 'none', ':focus-visible': ring },
} });
const view = <button {...stylex.props(styles.button)}>{label}</button>;
`;
    expect(scan(source, designSystem)).toEqual([]);
  });
});
