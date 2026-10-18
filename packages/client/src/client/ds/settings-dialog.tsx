import { useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  IconChevronDownOutlineRegular,
  IconCloseOutlineRegular,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { Modal } from '../modal.js';
import { border, color, radius, size, space, text } from './tokens.stylex.js';

const NARROW_QUERY = '(max-width: 648px)';

function narrowQuery(): MediaQueryList | undefined {
  return typeof matchMedia === 'function' ? matchMedia(NARROW_QUERY) : undefined;
}

function subscribeNarrow(listener: () => void): () => void {
  const query = narrowQuery();
  query?.addEventListener('change', listener);
  return () => {
    query?.removeEventListener('change', listener);
  };
}

function isNarrow(): boolean {
  return narrowQuery()?.matches ?? false;
}

export function useNarrowSettings(): boolean {
  return useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
}

const styles = stylex.create({
  dialog: {
    flexDirection: 'row',
    gap: 0,
    width: 'min(760px, 100%)',
    height: 'min(640px, 100%)',
    padding: 0,
    '--dsh-scrollbar-thumb': 'var(--dsw-alias-scrollbar-bg-l2)',
    '--dsh-scrollbar-thumb-hover': 'var(--dsw-alias-scrollbar-hover-l2)',
  },
  nav: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    width: '180px',
    paddingTop: space.x5,
    paddingInline: space.x3,
    boxSizing: 'border-box',
    borderRightWidth: border.hairline,
    borderRightStyle: 'solid',
    borderRightColor: color.divider,
  },
  navTitle: {
    paddingInline: space.x3,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  navList: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    overflowY: 'auto',
    paddingBottom: space.x4,
  },
  navCell: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    height: size.row,
    paddingInline: space.x3,
    boxSizing: 'border-box',
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: {
      default: 'transparent',
      ':hover': color.hover,
      ':is([aria-current=page])': color.selected,
    },
    color: { default: color.muted, ':is([aria-current=page])': color.fg, ':hover': color.fg },
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: { default: 400, ':is([aria-current=page])': text.strong },
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  navLabel: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dot: {
    flexShrink: 0,
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: radius.round,
    backgroundColor: color.danger,
  },
  dotLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x3,
  },
  content: {
    flexGrow: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  captionNarrow: {
    marginTop: space.x5,
    marginInline: space.x5,
  },
  header: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
    minHeight: size.row,
    paddingTop: space.x5,
    paddingBottom: space.x2,
    paddingInline: `${space.x6} ${space.x4}`,
  },
  headerNarrow: {
    paddingTop: space.x5,
    paddingInline: `${space.x5} ${space.x4}`,
  },
  title: {
    margin: 0,
    minWidth: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  actions: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
  },
  close: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size.icon,
    height: size.icon,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
  picker: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
    height: size.row,
    paddingInline: `${space.x4} ${space.x3}`,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: color.surface, ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
  body: {
    flexGrow: 1,
    minHeight: 0,
    paddingTop: space.x2,
    paddingBottom: space.x6,
    paddingInline: space.x6,
    overflowY: 'auto',
  },
  bodyNarrow: {
    paddingBottom: space.x5,
    paddingInline: space.x5,
  },
});

export interface SettingsDialogSection {
  readonly id: string;
  readonly label: string;
  readonly attention?: boolean;
}

export interface SettingsDialogLabels {
  readonly nav: string;
  readonly close: string;
  readonly picker: (section: string) => string;
  readonly attention?: string;
}

export interface SettingsDialogProps {
  readonly title: string;
  readonly navTitle?: ReactNode;
  readonly caption?: ReactNode;
  readonly navigationSearch?: ReactNode;
  readonly navigationResults?: ReactNode;
  readonly sections: readonly SettingsDialogSection[];
  readonly activeId: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onClose: () => void;
  readonly headerAction?: ReactNode;
  readonly labels: SettingsDialogLabels;
  readonly className?: string;
  readonly children: ReactNode;
}

function AttentionDot({ label }: { readonly label: string | undefined }): ReactElement {
  return <span role="img" aria-label={label} {...stylex.props(styles.dot)} />;
}

export function SettingsDialog({
  title,
  navTitle,
  caption,
  navigationSearch,
  navigationResults,
  sections,
  activeId,
  onSelect,
  onClose,
  headerAction,
  labels,
  className,
  children,
}: SettingsDialogProps): ReactElement {
  const narrow = useNarrowSettings();
  const [pickerOpen, setPickerOpen] = useState(false);
  const active = sections.find((section) => section.id === activeId);
  const close = (): void => {
    setPickerOpen(false);
    onClose();
  };
  const dialogClass = [className, stylex.props(styles.dialog).className].filter(Boolean).join(' ');
  return (
    <Modal open headless onClose={close} title={title} className={dialogClass}>
      {narrow ? null : (
        <nav aria-label={labels.nav} {...stylex.props(styles.nav)}>
          {navTitle === undefined ? null : <div {...stylex.props(styles.navTitle)}>{navTitle}</div>}
          {caption}
          {navigationSearch}
          <div {...stylex.props(styles.navList)}>
            {navigationResults ??
              sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  data-settings-section={section.id}
                  aria-current={section.id === active?.id ? 'page' : undefined}
                  data-modal-autofocus={section.id === active?.id ? '' : undefined}
                  onClick={() => {
                    onSelect(section.id);
                  }}
                  {...stylex.props(styles.navCell)}
                >
                  <span {...stylex.props(styles.navLabel)}>{section.label}</span>
                  {section.attention === true ? <AttentionDot label={labels.attention} /> : null}
                </button>
              ))}
          </div>
        </nav>
      )}
      <div {...stylex.props(styles.content)}>
        {narrow && navigationSearch !== undefined ? (
          <div {...stylex.props(styles.captionNarrow)}>
            {navigationSearch}
            {navigationResults}
          </div>
        ) : null}
        {narrow && caption !== undefined ? (
          <div {...stylex.props(styles.captionNarrow)}>{caption}</div>
        ) : null}
        <div {...stylex.props(styles.header, narrow && styles.headerNarrow)}>
          {narrow ? (
            <Menu
              open={pickerOpen}
              portal
              align="start"
              items={sections.map((section) => ({
                id: section.id,
                label:
                  section.attention === true ? (
                    <span {...stylex.props(styles.dotLabel)}>
                      {section.label}
                      <AttentionDot label={labels.attention} />
                    </span>
                  ) : (
                    section.label
                  ),
              }))}
              selectedId={active?.id}
              onSelect={(id) => {
                setPickerOpen(false);
                onSelect(id);
              }}
              onClose={() => {
                setPickerOpen(false);
              }}
              anchor={
                <button
                  type="button"
                  aria-label={labels.picker(active?.label ?? '')}
                  aria-haspopup="menu"
                  aria-expanded={pickerOpen}
                  data-modal-autofocus=""
                  onClick={() => {
                    setPickerOpen((value) => !value);
                  }}
                  {...stylex.props(styles.picker)}
                >
                  {active?.label}
                  <IconChevronDownOutlineRegular size={12} />
                </button>
              }
            />
          ) : (
            <h2 {...stylex.props(styles.title)}>{active?.label}</h2>
          )}
          <span {...stylex.props(styles.actions)}>
            {headerAction}
            <button
              type="button"
              aria-label={labels.close}
              onClick={close}
              {...stylex.props(styles.close)}
            >
              <IconCloseOutlineRegular size={14} />
            </button>
          </span>
        </div>
        <div key={active?.id} {...stylex.props(styles.body, narrow && styles.bodyNarrow)}>
          {children}
        </div>
      </div>
    </Modal>
  );
}
