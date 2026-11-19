import { Icon } from './icon.js';
import { IconButton } from './icon-button.js';
import { PointerMenu, type MenuPoint } from './pointer-menu.js';
import {
  Fragment,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';

import { Dialog } from './dialog.js';
import { NavGroupHeading, NavItem } from './nav-item.js';
import {
  edge,
  ink,
  layer,
  line,
  size,
  space,
  status,
  style,
  type as text,
  radius,
} from './tobs.stylex.js';
import {
  layoutViewportWidth,
  subscribeLayoutViewport,
  useWindowClass,
  viewportMedia,
} from './window-class.js';

const LEGACY_PICKER_WIDTH = 648;
const LEGACY_PICKER_QUERY = `(max-width: ${LEGACY_PICKER_WIDTH}px)`;

function legacyPicker(): boolean {
  const width = layoutViewportWidth();
  return width > 0
    ? width <= LEGACY_PICKER_WIDTH
    : (viewportMedia(LEGACY_PICKER_QUERY)?.matches ?? false);
}

const subscribeLegacyPicker = (onChange: () => void): (() => void) =>
  subscribeLayoutViewport([LEGACY_PICKER_QUERY], onChange);

const serverLegacyPicker = (): boolean => false;

const styles = stylex.create({
  dialog: {
    flexDirection: 'row',
    gap: space.x1,
    backgroundColor: layer.canvas,
    width: 'min(804px, 100%)',
    height: 'min(640px, 100%)',
    padding: 0,
    '--dsh-scrollbar-thumb': line.strong,
    '--dsh-scrollbar-thumb-hover': ink.tertiary,
  },
  viewport: {
    paddingBlock: `max(calc(${space.x6} / var(--bh-window-zoom, 1)), calc(var(--dsh-frame-overlay-top, ${space.x6}) / var(--bh-window-zoom, 1)))`,
    paddingInline: `calc(${space.x6} / var(--bh-window-zoom, 1))`,
  },
  viewportCompact: {
    top: 'calc(var(--dsh-frame-overlay-top, 0px) / var(--bh-window-zoom, 1))',
    paddingBlock: 0,
    paddingInline: 0,
  },
  dialogCompact: { width: '100%', height: '100%', borderRadius: 0, boxShadow: 'none' },
  nav: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    width: 'min(208px, 32%)',
    paddingTop: space.x5,
    paddingInline: space.x3,
    boxSizing: 'border-box',
    backgroundColor: style.surfaceNav,
    fontFamily: 'inherit',
  },
  navCompact: {
    width: '100%',
    minHeight: 0,
    flexShrink: 1,
    flexGrow: 1,
    paddingTop: space.x2,
    paddingInline: space.x5,
    backgroundColor: style.surfaceListBackdrop,
  },
  compactAction: { width: size.rowLarge, height: size.rowLarge },
  compactRow: { minHeight: `max(${size.rowLarge}, ${style.rowNav})` },
  compactGroup: {
    padding: style.listGroupPaddingBlock,
    borderRadius: style.listGroupRadius,
    backgroundColor: style.listGroupFill,
  },
  navTitle: {
    paddingInline: space.x3,
    color: ink.primary,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.titleWeight,
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
    borderRadius: radius.full,
    backgroundColor: status.dangerBase,
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
    backgroundColor: style.surfaceListBackdrop,
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
    minHeight: style.rowNav,
    paddingTop: space.x5,
    paddingBottom: space.x2,
    paddingInline: `${space.x6} ${space.x4}`,
  },
  headerNarrow: {
    paddingTop: space.x5,
    paddingInline: `${space.x5} ${space.x4}`,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  title: {
    margin: 0,
    minWidth: 0,
    color: ink.primary,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.titleWeight,
    overflowWrap: 'anywhere',
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
  },
  compactHeading: { flexGrow: 1, flexWrap: 'wrap', columnGap: space.x3, rowGap: 0 },
  scope: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x1,
    minWidth: 0,
    color: ink.secondary,
    fontSize: text.captionSize,
    lineHeight: text.captionLine,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    maxWidth: '100%',
  },
  picker: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
    height: style.rowNav,
    paddingInline: `${space.x4} ${space.x3}`,
    borderWidth: 0,
    borderRadius: style.radiusControl,
    backgroundColor: { default: layer.raised, ':hover': style.navSelectedFill },
    color: ink.primary,
    fontFamily: 'inherit',
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.titleWeight,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${edge.focus} solid ${line.focus}` },
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
    '--bh-card-list-edge': 'transparent',
    '--bh-card-list-shadow': `0 0 0 0.5px ${style.listGroupEdge}`,
    '--bh-card-list-radius': style.listGroupRadius,
    '--bh-card-list-fill': style.listGroupFill,
    '--bh-card-list-gap': style.listGap,
    '--bh-card-list-padding': `${style.listGroupPaddingBlock} ${style.listGroupPaddingInline}`,
    '--bh-card-list-stack': space.x5,
    '--bh-card-row-fill': style.listItemFill,
    '--bh-card-row-radius': style.listItemRadius,
    '--bh-card-row-separator': style.listSeparator,
    '--bh-card-main-inline': style.listItemPadding,
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
  readonly label?: ReactNode;
}

export interface SettingsDialogLabels {
  readonly nav: string;
  readonly close: string;
  readonly picker?: (section: string) => string;
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
  readonly environmentAction?: ReactNode | undefined;
  readonly overlay?: ReactNode | undefined;
  readonly compactNavigation?: {
    readonly showList: boolean;
    readonly onBack: () => void;
    readonly onExpand: () => void;
    readonly backLabel: string;
  };
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
        aria-label={labels.picker?.(active?.label ?? '') ?? active?.label}
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
        <Icon name="chevron-down" size={12} />
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

export function SettingsDialog(props: SettingsDialogProps): ReactElement {
  return props.compactNavigation === undefined ? (
    <PickerSettingsDialog {...props} />
  ) : (
    <PageSettingsDialog {...props} />
  );
}

function PickerSettingsDialog(props: SettingsDialogProps): ReactElement {
  const compact = useSyncExternalStore(subscribeLegacyPicker, legacyPicker, serverLegacyPicker);
  return <SettingsFrame {...props} compact={compact} />;
}

function PageSettingsDialog(props: SettingsDialogProps): ReactElement {
  return <SettingsFrame {...props} compact={useWindowClass() === 'compact'} />;
}

function SettingsFrame({
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
  environmentAction,
  overlay,
  compactNavigation,
  labels,
  className,
  children,
  compact,
}: SettingsDialogProps & { readonly compact: boolean }): ReactElement {
  const fullScreen = compact && compactNavigation !== undefined;
  const list = fullScreen && compactNavigation.showList;
  const page = fullScreen ? (list ? 'list' : 'detail') : 'split';
  const previousPage = useRef(page);
  const heading = useRef<HTMLHeadingElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const groupId = useId();
  const active = sections.find((section) => section.id === activeId);
  useLayoutEffect(() => {
    if (!compact && compactNavigation?.showList) compactNavigation.onExpand();
  }, [compact, compactNavigation]);
  useLayoutEffect(() => {
    const previous = previousPage.current;
    previousPage.current = page;
    if (page === previous || page === 'split') return;
    if (page === 'list') {
      const row = navigation.current?.querySelector<HTMLButtonElement>(
        '[data-settings-return-focus]',
      );
      (row ?? heading.current)?.focus();
    } else if (!document.activeElement?.hasAttribute('data-settings-highlight')) {
      const focused = document.activeElement;
      if (focused === document.body || navigation.current?.contains(focused))
        heading.current?.focus();
    }
  }, [page]);
  const navCell = (section: SettingsDialogSection): ReactElement => (
    <NavItem
      key={section.id}
      data={{
        'data-settings-section': section.id,
        'data-modal-autofocus': !fullScreen && section.id === active?.id ? '' : undefined,
        'data-settings-return-focus': list && section.id === active?.id ? '' : undefined,
      }}
      current={!list && section.id === active?.id}
      icon={section.icon}
      label={section.label}
      attention={section.attention === true ? (labels.attention ?? '') : undefined}
      trailing={list ? <Icon name="chevron-right" /> : undefined}
      xstyle={list ? styles.compactRow : undefined}
      onSelect={() => onSelect(section.id)}
    />
  );
  const groupStyle = stylex.props(styles.navGroupList, list && styles.compactGroup);
  const nav = (
    <nav
      ref={navigation}
      aria-label={labels.nav}
      {...stylex.props(styles.nav, list && styles.navCompact)}
    >
      {!list && navTitle !== undefined ? (
        <div {...stylex.props(styles.navTitle)}>{navTitle}</div>
      ) : null}
      {caption}
      {navigationSearch}
      <div {...stylex.props(styles.navList)}>
        {navigationResults ??
          (groups === undefined ? (
            <div {...groupStyle}>{sections.map(navCell)}</div>
          ) : (
            groups.map((group) => {
              const members = sections.filter((section) => section.group === group.id);
              if (members.length === 0) return null;
              if (group.label === undefined)
                return (
                  <div key={group.id} {...groupStyle}>
                    {members.map(navCell)}
                  </div>
                );
              const headingId = `${groupId}-${group.id}`;
              return (
                <Fragment key={group.id}>
                  <NavGroupHeading id={headingId} label={group.label} />
                  <div role="group" aria-labelledby={headingId} {...groupStyle}>
                    {members.map(navCell)}
                  </div>
                </Fragment>
              );
            })
          ))}
      </div>
    </nav>
  );
  return (
    <Dialog
      open
      presentation="center"
      onClose={onClose}
      title={title}
      className={className}
      xstyle={[styles.dialog, fullScreen && styles.dialogCompact]}
      viewportXstyle={[styles.viewport, fullScreen && styles.viewportCompact]}
    >
      {overlay}
      {compact ? null : nav}
      <div data-settings-page={page} {...stylex.props(styles.content)}>
        {compact && !fullScreen && caption !== undefined ? (
          <div {...stylex.props(styles.captionNarrow)}>{caption}</div>
        ) : null}
        <div {...stylex.props(styles.header, compact && styles.headerNarrow)}>
          {fullScreen && !list ? (
            <IconButton
              aria-label={compactNavigation.backLabel}
              size="row"
              xstyle={styles.compactAction}
              onClick={compactNavigation.onBack}
            >
              <Icon name="arrow-left" />
            </IconButton>
          ) : null}
          <div {...stylex.props(styles.heading, fullScreen && styles.compactHeading)}>
            {compact && !fullScreen ? (
              <SectionPicker
                sections={sections}
                activeId={activeId}
                labels={labels}
                onSelect={onSelect}
              />
            ) : (
              <h2
                ref={heading}
                tabIndex={-1}
                data-modal-autofocus={fullScreen ? '' : undefined}
                {...stylex.props(styles.title)}
              >
                {list ? (navTitle ?? title) : active?.label}
              </h2>
            )}
            {list || scope === undefined ? null : (
              <span data-settings-scope="" {...stylex.props(styles.scope)}>
                {scope}
              </span>
            )}
          </div>
          <div {...stylex.props(styles.actions)}>
            {!list && headerAction}
            {environmentAction}
            <IconButton
              aria-label={labels.close}
              size={fullScreen ? 'row' : 'icon'}
              xstyle={fullScreen ? styles.compactAction : undefined}
              onClick={onClose}
            >
              <Icon name="x" />
            </IconButton>
          </div>
        </div>
        {list ? (
          nav
        ) : (
          <div key={activeId} {...stylex.props(styles.body, compact && styles.bodyNarrow)}>
            {children}
          </div>
        )}
      </div>
    </Dialog>
  );
}
