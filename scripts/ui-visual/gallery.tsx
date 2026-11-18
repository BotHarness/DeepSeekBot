import { useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../../packages/client/src/client/ds/button.js';
import { IconButton } from '../../packages/client/src/client/ds/icon-button.js';
import { Input } from '../../packages/client/src/client/ds/input.js';
import { NavGroupHeading, NavItem } from '../../packages/client/src/client/ds/nav-item.js';
import { SegmentedControl } from '../../packages/client/src/client/ds/segmented.js';
import { SettingsRow, SettingsSection } from '../../packages/client/src/client/ds/settings-row.js';
import { Switch } from '../../packages/client/src/client/ds/switch.js';
import { TOBS_STYLES } from '../../packages/client/src/client/ds/tobs-tokens.generated.js';
import { tobsTokens, type TobsStyle } from '../../packages/client/src/client/tobs-theme.js';

type Mode = 'light' | 'dark';

const COPY = {
  en: {
    nav: 'Settings sections',
    group: 'Workspace',
    items: ['General', 'Appearance', 'Notifications'],
    attention: 'Needs attention',
    section: 'Appearance',
    description: 'How Bot mode looks on this device.',
    motion: 'Reduce motion',
    density: 'Density',
    compact: 'Compact',
    comfortable: 'Comfortable',
    name: 'Display name',
    save: 'Save',
    cancel: 'Cancel',
    more: 'More options',
  },
  zh: {
    nav: '设置分区',
    group: '工作区',
    items: ['通用', '外观', '通知'],
    attention: '需要处理',
    section: '外观',
    description: '这台设备上 Bot 模式的外观。',
    motion: '减少动态效果',
    density: '密度',
    compact: '紧凑',
    comfortable: '宽松',
    name: '显示名称',
    save: '保存',
    cancel: '取消',
    more: '更多选项',
  },
} as const;

type Language = keyof typeof COPY;

function Glyph(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Case({
  style,
  mode,
  language,
}: {
  readonly style: TobsStyle;
  readonly mode: Mode;
  readonly language: Language;
}): ReactElement {
  const copy = COPY[language];
  const [current, setCurrent] = useState(1);
  const [motion, setMotion] = useState(true);
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  const id = `${style}-${mode}-${language}`;
  return (
    <section
      lang={language}
      data-gallery-case={id}
      aria-label={id}
      style={{
        ...tobsTokens(mode, 'classic-blue', undefined, style),
        colorScheme: mode,
        background: 'var(--tobs-layer-canvas)',
        color: 'var(--tobs-ink-primary)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 200px) minmax(0, 1fr)',
        gap: 16,
        padding: 16,
      }}
    >
      <nav
        aria-label={copy.nav}
        data-gallery-nav=""
        style={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          paddingInline: 8,
          background: 'var(--tobs-style-surface-nav, var(--tobs-layer-nav))',
        }}
      >
        <NavGroupHeading first id={`${id}-group`} label={copy.group} />
        <div
          role="group"
          aria-labelledby={`${id}-group`}
          style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {copy.items.map((label, index) => (
            <NavItem
              key={label}
              icon={<Glyph />}
              label={label}
              current={index === current}
              attention={index === 2 ? copy.attention : undefined}
              onSelect={() => setCurrent(index)}
            />
          ))}
        </div>
      </nav>
      <div style={{ minWidth: 0, display: 'grid', gap: 16, alignContent: 'start' }}>
        <SettingsSection title={copy.section} description={copy.description}>
          <SettingsRow
            title={copy.motion}
            control={<Switch label={copy.motion} checked={motion} onChange={setMotion} />}
          />
          <SettingsRow
            title={copy.density}
            control={
              <SegmentedControl
                id={`${id}-density`}
                label={copy.density}
                value={density}
                onChange={setDensity}
                options={[
                  { value: 'compact', label: copy.compact },
                  { value: 'comfortable', label: copy.comfortable },
                ]}
              />
            }
          />
          <SettingsRow
            title={copy.name}
            control={<Input aria-label={copy.name} defaultValue="Ada" />}
          />
        </SettingsSection>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="primary">{copy.save}</Button>
          <Button variant="outline">{copy.cancel}</Button>
          <Button variant="ghost" icon={<Glyph />}>
            {copy.more}
          </Button>
          <IconButton aria-label={copy.more}>
            <Glyph />
          </IconButton>
        </div>
      </div>
    </section>
  );
}

export const STYLES = Object.keys(TOBS_STYLES) as TobsStyle[];
export const MODES: readonly Mode[] = ['light', 'dark'];
export const LANGUAGES = Object.keys(COPY) as Language[];

function Gallery(): ReactElement {
  return (
    <main>
      {STYLES.flatMap((style) =>
        MODES.flatMap((mode) =>
          LANGUAGES.map((language) => (
            <Case
              key={`${style}-${mode}-${language}`}
              style={style}
              mode={mode}
              language={language}
            />
          )),
        ),
      )}
    </main>
  );
}

const css = document.createElement('style');
css.textContent = '@bh-stylex-css';
document.head.append(css);

const root = document.getElementById('app');
if (root) createRoot(root).render(<Gallery />);
