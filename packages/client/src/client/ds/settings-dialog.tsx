import { PointerMenu, type MenuPoint } from './pointer-menu.js';
import {
  Fragment,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  IconChevronDownOutlineRegular,
  IconCloseOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { Modal } from '../modal.js';
import { NavGroupHeading, NavItem } from './nav-item.js';
import { layer, line, ink, type as tobsType } from './tobs.stylex.js';
import { border, color, radius, size, space, text } from './tokens.stylex.js';

const NARROW_QUERY = '(max-width: 648px)';

function narrowQuery(): MediaQueryList | undefined {
  return typeof matchMedia === 'function' ? matchMedia(NARROW_QUERY) : undefined;
}

function subscribeNarrow(listener: () => void): () => void {
  const query = narrowQuery();
  query?.addEventListener('change', listener);
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(listener) : undefined;
  if (typeof document !== 'undefined' && document.body) resize?.observe(document.body);
  return () => {
    query?.removeEventListener('change', listener);
    resize?.disconnect();
  };
}

function isNarrow(): boolean {
  if (typeof document !== 'undefined' && document.body.clientWidth > 0)
    return document.body.clientWidth <= 648;
  return narrowQuery()?.matches ?? false;
}

export function useNarrowSettings(): boolean {
  return useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
}

const VIEWPORT_CSS = `body > :has(> .bh-settings-dialog) {
  padding: max(calc(${space.x6} / var(--bh-window-zoom, 1)), calc(var(--dsh-frame-overlay-top, ${space.x6}) / var(--bh-window-zoom, 1))) calc(${space.x6} / var(--bh-window-zoom, 1));
}
.bh-settings-dialog input[type="file"] { min-width: 0; max-width: 100%; }`;

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
    borderRightColor: line.divider,
    backgroundColor: layer.nav,
    fontFamily: 'inherit',
  },
  navTitle: {
    paddingInline: space.x3,
    color: ink.primary,
    fontSize: tobsType.titleSize,
    lineHeight: tobsType.titleLine,
    fontWeight: tobsType.titleWeight,
  },
  navList: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    overflowY: 'auto',
    paddingBottom: space.x4,
  },
  navGroupList: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
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
    minHeight: 0,
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
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
  },
  scope: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x1,
    minWidth: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
    containerType: 'inline-size',
    containerName: 'bh-settings',
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
  readonly icon?: ReactNode;
  readonly attention?: boolean;
  readonly group?: string;
}

export interface SettingsDialogGroup {
  readonly id: string;
  readonly label: ReactNode;
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
  readonly caption?: ReactNode | undefined;
  readonly navigationSearch?: ReactNode;
  readonly navigationResults?: ReactNode;
  readonly sections: readonly SettingsDialogSection[];
  readonly groups?: readonly SettingsDialogGroup[] | undefined;
  readonly scope?: ReactNode | undefined;
  readonly activeId: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onClose: () => void;
  readonly headerAction?: ReactNode | undefined;
  readonly labels: SettingsDialogLabels;
  readonly className?: string;
  readonly children: ReactNode;
}

function AttentionDot({ label }: { readonly label: string | undefined }): ReactElement {
  return <span role="img" aria-label={label} {...stylex.props(styles.dot)} />;
}

function SectionPicker({
  sections,
  activeId,
  labels,
  onSelect,
}: Pick<SettingsDialogProps, 'sections' | 'activeId' | 'labels' | 'onSelect'>): ReactElement {
  const [pickerPoint, setPickerPoint] = useState<MenuPoint>();
  const pickerTrigger = useRef<HTMLButtonElement>(null);
  const closePicker = () => {
    setPickerPoint(undefined);
    const trigger = pickerTrigger.current;
    const closingMenu = document.activeElement?.closest('[data-pointer-menu]');
    queueMicrotask(() => {
      const activeElement = document.activeElement;
      if (
        trigger?.isConnected &&
        (activeElement === document.body ||
          (activeElement !== null && closingMenu?.contains(activeElement)))
      )
        trigger.focus({ preventScroll: true });
    });
  };
  const active = sections.find((section) => section.id === activeId);
  return (
    <>
      <button
        ref={pickerTrigger}
        type="button"
        aria-label={labels.picker(active?.label ?? '')}
        aria-haspopup="menu"
        aria-expanded={pickerPoint !== undefined}
        data-modal-autofocus=""
        onClick={(event) => {
          if (pickerPoint) closePicker();
          else {
            const rect = event.currentTarget.getBoundingClientRect();
            setPickerPoint({ x: rect.left, y: rect.bottom });
          }
        }}
        {...stylex.props(styles.picker)}
      >
        {active?.label}
        <IconChevronDownOutlineRegular size={12} />
      </button>
      {pickerPoint ? (
        <PointerMenu
          point={pickerPoint}
          container={pickerTrigger.current?.closest('[role="dialog"]') ?? document.body}
          autoFocus
          anchor={<span aria-hidden="true" />}
          items={sections.map((section) => ({
            id: section.id,
            icon: section.icon,
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
            closePicker();
            onSelect(id);
          }}
          onClose={closePicker}
        />
      ) : null}
    </>
  );
}

export function SettingsDialog({
  title,
  navTitle,
  caption,
  navigationSearch,
  navigationResults,
  sections,
  groups,
  scope,
  activeId,
  onSelect,
  onClose,
  headerAction,
  labels,
  className,
  children,
}: SettingsDialogProps): ReactElement {
  const narrow = useNarrowSettings();
  const groupId = useId();
  const active = sections.find((section) => section.id === activeId);
  const close = (): void => {
    onClose();
  };
  const navCell = (section: SettingsDialogSection): ReactElement => (
    <NavItem
      key={section.id}
      data={{
        'data-settings-section': section.id,
        'data-modal-autofocus': section.id === active?.id ? '' : undefined,
      }}
      current={section.id === active?.id}
      icon={section.icon}
      label={section.label}
      attention={section.attention === true ? (labels.attention ?? '') : undefined}
      onSelect={() => {
        onSelect(section.id);
      }}
    />
  );
  const dialogClass = ['bh-settings-dialog', className, stylex.props(styles.dialog).className]
    .filter(Boolean)
    .join(' ');
  return (
    <Modal open headless onClose={close} title={title} className={dialogClass}>
      <style data-plugin="@botharness/ui" data-plugin-css="@botharness/ui/settings-viewport">
        {VIEWPORT_CSS}
      </style>
      {narrow ? null : (
        <nav aria-label={labels.nav} {...stylex.props(styles.nav)}>
          {navTitle === undefined ? null : <div {...stylex.props(styles.navTitle)}>{navTitle}</div>}
          {caption}
          {navigationSearch}
          <div {...stylex.props(styles.navList)}>
            {navigationResults ??
              (groups === undefined
                ? sections.map(navCell)
                : groups.map((group) => {
                    const members = sections.filter((section) => section.group === group.id);
                    if (members.length === 0) return null;
                    const headingId = `${groupId}-${group.id}`;
                    return (
                      <Fragment key={group.id}>
                        <NavGroupHeading id={headingId} label={group.label} />
                        <div
                          role="group"
                          aria-labelledby={headingId}
                          {...stylex.props(styles.navGroupList)}
                        >
                          {members.map(navCell)}
                        </div>
                      </Fragment>
                    );
                  }))}
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
          <span {...stylex.props(styles.heading)}>
            {narrow ? (
              <SectionPicker
                sections={sections}
                activeId={activeId}
                labels={labels}
                onSelect={onSelect}
              />
            ) : (
              <h2 {...stylex.props(styles.title)}>{active?.label}</h2>
            )}
            {scope === undefined ? null : (
              <span data-settings-scope="" {...stylex.props(styles.scope)}>
                {scope}
              </span>
            )}
          </span>
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
