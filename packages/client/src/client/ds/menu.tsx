import { Menu as BaseMenu } from '@base-ui/react/menu';
import * as stylex from '@stylexjs/stylex';
import {
  createContext,
  forwardRef,
  useContext,
  useCallback,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';

import { APPEARANCE_CLASS } from '../appearance-scope.js';
import { Icon } from './icon.js';
import { KeyCombo } from './kbd.js';
import { useShellLayer } from './shell-layer.js';
import {
  edge,
  elevation,
  ink,
  layer,
  line,
  motion,
  size,
  space,
  state,
  status,
  style,
  type,
} from './tobs.stylex.js';

export interface MenuItem {
  id: string;
  label: ReactNode;
  disabled?: boolean;
  shortcut?: { keys: readonly string[]; aria?: string | undefined };
  icon?: ReactNode;
  danger?: boolean;
  submenu?: readonly MenuEntry[];
}

export interface MenuSeparator {
  type: 'separator';
  id: string;
}

export interface MenuLabel {
  type: 'label';
  id: string;
  text: string;
}

export type MenuEntry = MenuItem | MenuSeparator | MenuLabel;

const MenuContext = createContext(false);

const POINTER_GRACE_MS = 300;
const fadeIn = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

const styles = stylex.create({
  anchor: { display: 'inline-flex', minWidth: 0 },
  positioner: { zIndex: 1100, outline: 'none' },
  popup: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    minWidth: '180px',
    maxWidth: 'min(320px, calc(100vw - 32px))',
    maxHeight: 'var(--available-height, 70vh)',
    paddingBlock: space.x1,
    borderRadius: style.radiusMenu,
    backgroundColor: layer.elevated,
    boxShadow: elevation.x2,
    color: ink.primary,
    fontFamily: 'inherit',
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    outline: 'none',
    animationName: fadeIn,
    animationDuration: { default: motion.fast, '@media (prefers-reduced-motion: reduce)': '0s' },
  },
  compact: { fontSize: type.captionSize, lineHeight: type.captionLine, minWidth: '140px' },
  scroll: { overflowY: 'auto', minHeight: 0, flex: '1 1 auto' },
  footer: {
    flex: '0 0 auto',
    marginTop: space.x1,
    paddingTop: space.x1,
    borderTopWidth: edge.hairline,
    borderTopStyle: 'solid',
    borderTopColor: line.divider,
  },
  row: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    width: `calc(100% - ${space.x1} * 2)`,
    minHeight: size.controlLarge,
    marginInline: space.x1,
    paddingInline: space.x2,
    borderWidth: 0,
    borderRadius: style.radiusControl,
    backgroundColor: { default: 'transparent', ':is([data-highlighted])': state.hover },
    color: 'inherit',
    font: 'inherit',
    textAlign: 'start',
    cursor: { default: 'pointer', ':is([data-disabled])': 'default' },
    opacity: { default: 1, ':is([data-disabled])': 0.5 },
    outline: 'none',
    userSelect: 'none',
  },
  dense: { minHeight: size.row },
  compactRow: { minHeight: size.controlSmall },
  selectedFill: { backgroundColor: state.selected, color: state.selectedInk },
  danger: { color: status.dangerInk },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size.iconSlot,
    color: { default: ink.secondary, ':is([data-danger] *)': 'inherit' },
  },
  label: {
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  trail: { display: 'inline-flex', alignItems: 'center', flexShrink: 0, color: ink.tertiary },
  heading: {
    paddingBlock: space.x1,
    paddingInline: space.x3,
    color: ink.tertiary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
  },
  separator: {
    height: edge.hairline,
    marginBlock: space.x1,
    marginInline: space.x2,
    backgroundColor: line.divider,
  },
  surface: {
    boxSizing: 'border-box',
    paddingBlock: space.x1,
    borderRadius: style.radiusMenu,
    backgroundColor: layer.elevated,
    boxShadow: elevation.x2,
    color: ink.primary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
  },
});

interface RowLook {
  readonly dense: boolean;
  readonly compact: boolean;
}

function rowStyles(look: RowLook, selectedFill: boolean, danger: boolean) {
  return stylex.props(
    styles.row,
    look.dense && styles.dense,
    look.compact && styles.compactRow,
    selectedFill && styles.selectedFill,
    danger && styles.danger,
  );
}

function RowContent({
  icon,
  label,
  shortcut,
  trailing,
}: {
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly shortcut?: MenuItem['shortcut'];
  readonly trailing?: ReactNode;
}): ReactElement {
  return (
    <>
      {icon === undefined ? null : <span {...stylex.props(styles.icon)}>{icon}</span>}
      <span {...stylex.props(styles.label)}>{label}</span>
      {shortcut === undefined ? null : (
        <span {...stylex.props(styles.trail)} aria-hidden="true">
          <KeyCombo keys={shortcut.keys} />
        </span>
      )}
      {trailing === undefined ? null : <span {...stylex.props(styles.trail)}>{trailing}</span>}
    </>
  );
}

interface EntryContext {
  readonly look: RowLook;
  readonly selected: ReadonlySet<string>;
  readonly selection: 'check' | 'fill';
  readonly onSelect: ((id: string) => void) | undefined;
  readonly listClass: string;
}

function Entries({
  entries,
  context,
}: {
  readonly entries: readonly MenuEntry[];
  readonly context: EntryContext;
}): ReactElement {
  return (
    <>
      {entries.map((entry, index) => {
        if ('type' in entry && entry.type === 'separator')
          return index === 0 ? null : (
            <div key={entry.id} role="separator" {...stylex.props(styles.separator)} />
          );
        if ('type' in entry && entry.type === 'label')
          return (
            <div key={entry.id} role="presentation" {...stylex.props(styles.heading)}>
              {entry.text}
            </div>
          );
        const item = entry as MenuItem;
        const selected = context.selected.has(item.id);
        if (item.submenu !== undefined && item.submenu.length > 0)
          return (
            <BaseMenu.SubmenuRoot key={item.id}>
              <BaseMenu.SubmenuTrigger
                disabled={item.disabled}
                data-danger={item.danger ? '' : undefined}
                {...rowStyles(context.look, false, item.danger === true)}
              >
                <RowContent
                  icon={item.icon}
                  label={item.label}
                  trailing={<Icon name="chevron-right" />}
                />
              </BaseMenu.SubmenuTrigger>
              <BaseMenu.Portal>
                <BaseMenu.Positioner
                  side="inline-end"
                  align="start"
                  sideOffset={4}
                  {...stylex.props(styles.positioner)}
                >
                  <BaseMenu.Popup className={context.listClass}>
                    <div {...stylex.props(styles.scroll)}>
                      <Entries entries={item.submenu} context={context} />
                    </div>
                  </BaseMenu.Popup>
                </BaseMenu.Positioner>
              </BaseMenu.Portal>
            </BaseMenu.SubmenuRoot>
          );
        return (
          <BaseMenu.Item
            key={item.id}
            disabled={item.disabled}
            closeOnClick={false}
            aria-checked={selected && context.selection === 'check' ? true : undefined}
            data-selected={selected ? '' : undefined}
            data-danger={item.danger ? '' : undefined}
            aria-keyshortcuts={item.shortcut?.aria}
            onClick={(event) => {
              event.preventBaseUIHandler();
              context.onSelect?.(item.id);
            }}
            {...rowStyles(
              context.look,
              selected && context.selection === 'fill',
              item.danger === true,
            )}
          >
            <RowContent
              icon={item.icon}
              label={item.label}
              shortcut={item.shortcut}
              trailing={
                selected && context.selection === 'check' ? <Icon name="check" /> : undefined
              }
            />
          </BaseMenu.Item>
        );
      })}
    </>
  );
}

export interface MenuItemButtonProps {
  children: ReactNode;
  shortcut?: MenuItem['shortcut'];
  icon?: ReactNode;
  current?: boolean;
  disabled?: boolean;
  disabledReason?: string | undefined;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

export function MenuItemButton({
  children,
  shortcut,
  icon,
  current = false,
  disabled = false,
  disabledReason,
  danger = false,
  separatorBefore = false,
  onSelect,
}: MenuItemButtonProps): ReactElement {
  const nested = useContext(MenuContext);
  const reason = disabled ? disabledReason : undefined;
  const content = <RowContent icon={icon} label={children} shortcut={shortcut} />;
  if (!nested)
    return (
      <>
        {separatorBefore ? <div role="separator" {...stylex.props(styles.separator)} /> : null}
        <button
          type="button"
          role="menuitem"
          disabled={disabled && reason === undefined}
          aria-disabled={disabled ? true : undefined}
          aria-current={current ? 'page' : undefined}
          aria-description={reason}
          title={reason}
          aria-keyshortcuts={shortcut?.aria}
          onClick={() => {
            if (!disabled) onSelect();
          }}
          {...rowStyles({ dense: false, compact: false }, current, danger)}
        >
          {content}
        </button>
      </>
    );
  return (
    <>
      {separatorBefore ? <div role="separator" {...stylex.props(styles.separator)} /> : null}
      <BaseMenu.Item
        disabled={disabled && reason === undefined}
        aria-disabled={disabled ? true : undefined}
        aria-current={current ? 'page' : undefined}
        aria-description={reason}
        title={reason}
        closeOnClick={false}
        data-danger={danger ? '' : undefined}
        aria-keyshortcuts={shortcut?.aria}
        onClick={(event) => {
          event.preventBaseUIHandler();
          if (!disabled) onSelect();
        }}
        {...rowStyles({ dense: false, compact: false }, current, danger)}
      >
        {content}
      </BaseMenu.Item>
    </>
  );
}

export interface MenuProps {
  open: boolean;
  anchor: ReactNode;
  items?: readonly MenuEntry[];
  children?: ReactNode;
  footer?: readonly MenuEntry[];
  selectedId?: string | undefined;
  selectedIds?: readonly string[] | undefined;
  onSelect?: (id: string) => void;
  onClose: () => void;
  align?: 'start' | 'end';
  side?: 'bottom' | 'top' | 'right';
  portal?: boolean;
  closeOnPointerLeave?: boolean;
  dense?: boolean;
  compact?: boolean;
  selection?: 'check' | 'fill';
  autoFocus?: boolean;
  returnFocus?: (() => HTMLElement | null) | undefined;
  anchorRef?: RefObject<HTMLElement | null>;
  point?: { readonly x: number; readonly y: number } | undefined;
  container?: Element | undefined;
  className?: string | undefined;
  listClassName?: string | undefined;
}

function firstButton(node: HTMLElement | null): HTMLElement | null {
  return node?.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])') ?? node;
}

export function Menu({
  open,
  anchor,
  items = [],
  children,
  footer,
  selectedId,
  selectedIds,
  onSelect,
  onClose,
  align = 'start',
  side = 'bottom',
  portal = false,
  closeOnPointerLeave = false,
  dense = false,
  compact = false,
  selection = 'check',
  autoFocus = false,
  returnFocus,
  anchorRef,
  point,
  container,
  className,
  listClassName,
}: MenuProps): ReactElement {
  const wrapper = useRef<HTMLSpanElement | null>(null);
  const popup = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const leave = useRef<number | undefined>(undefined);
  const focusFrame = useRef<number | undefined>(undefined);
  const [mounted, setMounted] = useState(false);
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      if (node !== null && popup.current === null) {
        const active = node.ownerDocument.activeElement;
        previousFocus.current =
          active instanceof HTMLElement && active !== node.ownerDocument.body ? active : null;
      }
      if (node === null) {
        if (focusFrame.current !== undefined) window.cancelAnimationFrame(focusFrame.current);
        focusFrame.current = undefined;
        if (leave.current !== undefined) window.clearTimeout(leave.current);
        leave.current = undefined;
      }
      popup.current = node;
      setMounted(node !== null);
      if (node !== null && autoFocus)
        focusFrame.current = window.requestAnimationFrame(() => {
          focusFrame.current = undefined;
          node.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')?.focus();
        });
    },
    [autoFocus],
  );
  useShellLayer(popup, open && mounted, onClose);
  const stay = () => {
    if (leave.current !== undefined) window.clearTimeout(leave.current);
    leave.current = undefined;
  };
  const away = () => {
    if (!closeOnPointerLeave || !open) return;
    stay();
    leave.current = window.setTimeout(onClose, POINTER_GRACE_MS);
  };
  const selected = new Set<string>([
    ...(selectedId === undefined ? [] : [selectedId]),
    ...(selectedIds ?? []),
  ]);
  const listClass = [
    APPEARANCE_CLASS,
    stylex.props(styles.popup, compact && styles.compact).className,
    listClassName,
  ]
    .filter(Boolean)
    .join(' ');
  const context: EntryContext = {
    look: { dense, compact },
    selected,
    selection,
    onSelect,
    listClass,
  };
  const anchorTarget =
    point !== undefined
      ? {
          getBoundingClientRect: () => new DOMRect(point.x, point.y, 0, 0),
        }
      : anchorRef !== undefined
        ? anchorRef
        : wrapper;
  const baseSide = side === 'right' ? 'inline-end' : side;
  return (
    <span
      ref={wrapper}
      className={[stylex.props(styles.anchor).className, className].filter(Boolean).join(' ')}
      data-tobs-menu-anchor=""
      onPointerEnter={stay}
      onPointerLeave={away}
    >
      {anchor}
      <BaseMenu.Root
        open={open}
        modal={false}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <BaseMenu.Portal
          container={
            typeof HTMLElement !== 'undefined' && container instanceof HTMLElement
              ? container
              : portal || point !== undefined
                ? undefined
                : wrapper
          }
        >
          <BaseMenu.Positioner
            anchor={anchorTarget}
            side={baseSide}
            align={align}
            sideOffset={point === undefined ? 4 : 0}
            collisionPadding={16}
            positionMethod="fixed"
            {...stylex.props(styles.positioner)}
          >
            <BaseMenu.Popup
              ref={attach}
              data-pointer-menu={point === undefined ? undefined : ''}
              className={listClass}
              finalFocus={() => {
                if (returnFocus !== undefined) return returnFocus() ?? false;
                const active = document.activeElement;
                if (
                  active !== document.body &&
                  active instanceof HTMLElement &&
                  !popup.current?.contains(active)
                )
                  return active;
                return previousFocus.current?.isConnected
                  ? previousFocus.current
                  : firstButton(wrapper.current);
              }}
              onPointerEnter={stay}
              onPointerLeave={away}
            >
              <MenuContext.Provider value>
                <div {...stylex.props(styles.scroll)}>
                  <Entries entries={items} context={context} />
                  {children}
                </div>
                {footer === undefined || footer.length === 0 ? null : (
                  <div {...stylex.props(styles.footer)}>
                    <Entries entries={footer} context={context} />
                  </div>
                )}
              </MenuContext.Provider>
            </BaseMenu.Popup>
          </BaseMenu.Positioner>
        </BaseMenu.Portal>
      </BaseMenu.Root>
    </span>
  );
}

export interface MenuSurfaceProps extends ComponentPropsWithoutRef<'div'> {
  compact?: boolean;
}

export const MenuSurface = forwardRef<HTMLDivElement, MenuSurfaceProps>(function MenuSurface(
  { compact = false, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      {...props}
      className={[
        APPEARANCE_CLASS,
        stylex.props(styles.surface, compact && styles.compact).className,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
});
