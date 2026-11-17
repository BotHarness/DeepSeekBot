import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';

import { useAnchoredPanel } from '../anchored-panel.js';
import { ChannelSidebarIcon } from '../channel-sidebar-icon.js';
import { useMountedResource } from '../mounted-resource.js';
import { Input } from './input.js';
import { elevation } from './tobs.stylex.js';
import { color, radius, space, text } from './tokens.stylex.js';

export interface FilterPickerOption {
  readonly value: string;
  readonly label: string;
  readonly name?: string | undefined;
  readonly hint?: string | undefined;
  readonly icon?: ReactNode;
  readonly disabled?: boolean | undefined;
  readonly filter?: string | undefined;
  readonly search?: readonly string[] | undefined;
  readonly favorite?: boolean | undefined;
}

export interface FilterPickerFavorites {
  readonly filter: FilterPickerFilter;
  readonly addLabel: string;
  readonly removeLabel: string;
  onToggle(value: string, favorite: boolean): void;
}

export interface FilterPickerFilter {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
}

export interface FilterPickerSide {
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  onSelect(value: string): void;
}

const styles = stylex.create({
  panel: {
    position: 'fixed',
    zIndex: 1100,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    width: 'min(640px, calc(100vw - 24px))',
    maxHeight: 'min(70vh, 440px)',
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: color.elevated,
    boxShadow: elevation.x2,
    color: color.fg,
  },
  body: { display: 'flex', flexGrow: 1, minHeight: 0 },
  rail: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    flexShrink: 0,
    padding: space.x3,
    overflowY: 'auto',
    backgroundColor: color.well,
  },
  railButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.muted,
    cursor: 'pointer',
  },
  railSelected: {
    backgroundColor: { default: color.navSelected, ':hover': color.navSelected },
    color: color.navSelectedInk,
  },
  main: { display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 },
  search: { display: 'flex', padding: space.x3 },
  searchInput: { flexGrow: 1 },
  list: {
    flexGrow: 1,
    minHeight: 0,
    overflowY: 'auto',
    paddingInline: space.x3,
    paddingBottom: space.x3,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    width: '100%',
    minHeight: '34px',
    paddingBlock: space.x2,
    paddingInline: space.x3,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    color: color.fg,
    font: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    cursor: 'pointer',
  },
  rowActive: { backgroundColor: color.hover },
  rowDisabled: { color: color.subtle, cursor: 'default' },
  rowSelected: { fontWeight: text.strong },
  rowIcon: { display: 'inline-flex', flexShrink: 0 },
  rowText: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
  },
  rowName: {
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowHint: {
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: color.muted,
    fontSize: text.metaSize,
    fontWeight: text.regular,
  },
  rowCheck: { display: 'inline-flex', color: color.accentText },
  rowLine: { display: 'flex', alignItems: 'center', gap: space.x1 },
  rowMain: { flexGrow: 1, minWidth: 0 },
  star: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '28px',
    height: '28px',
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.subtle,
    cursor: 'pointer',
    opacity: { default: 0, ':focus-visible': 1 },
  },
  starShown: { opacity: 1 },
  starOn: { color: color.warning },
  shortcut: {
    flexShrink: 0,
    paddingInline: space.x1,
    borderRadius: radius.xs,
    backgroundColor: color.well,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  grow: { flexGrow: 1 },
  empty: { padding: space.x3, color: color.muted, fontSize: text.bodySize },
  efforts: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    width: '168px',
    padding: space.x3,
    gap: space.x1,
    overflowY: 'auto',
    backgroundColor: color.well,
  },
  effortsTitle: {
    paddingBlock: space.x2,
    paddingInline: space.x3,
    color: color.muted,
    fontSize: text.metaSize,
  },
  notice: {
    paddingBlock: space.x2,
    paddingInline: space.x3,
    color: color.danger,
    fontSize: text.metaSize,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: space.x2,
    backgroundColor: color.well,
  },
  footerButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    paddingBlock: space.x2,
    paddingInline: space.x3,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.muted,
    font: 'inherit',
    fontSize: text.metaSize,
    cursor: 'pointer',
  },
});

export function FilterPicker({
  label,
  options,
  value,
  onSelect,
  closeOnSelect,
  filters,
  filtersLabel,
  allFilter,
  searchLabel,
  emptyLabel,
  side,
  footer,
  busy = false,
  favorites,
  notice,
  anchorRef,
  onClose,
}: {
  label: string;
  options: readonly FilterPickerOption[];
  value: string;
  onSelect(value: string): void;
  closeOnSelect: boolean;
  filters: readonly FilterPickerFilter[];
  filtersLabel: string;
  allFilter: FilterPickerFilter;
  searchLabel: string;
  emptyLabel: string;
  side?: FilterPickerSide | undefined;
  footer?: { label: string; icon: ReactNode; onSelect(): void } | undefined;
  busy?: boolean;
  favorites?: FilterPickerFavorites | undefined;
  notice?: string | undefined;
  anchorRef: RefObject<HTMLElement | null>;
  onClose(): void;
}): ReactElement {
  const listId = useId();
  const panel = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState(() =>
    favorites !== undefined &&
    options.some((option) => option.favorite === true && option.disabled !== true)
      ? favorites.filter.key
      : allFilter.key,
  );
  const favoriteKey = favorites?.filter.key;
  const [query, setQuery] = useState('');
  const [held, setHeld] = useState<ReadonlySet<string>>();
  const listed = (option: FilterPickerOption) =>
    held === undefined ? option.favorite === true : held.has(option.value);
  const [active, setActive] = useState<string>();
  const position = useAnchoredPanel({ open: true, anchorRef, panelRef: panel, gap: 6, margin: 12 });
  const dismiss = useRef(onClose);
  dismiss.current = onClose;
  const mount = useMountedResource<HTMLDivElement>(
    (node) => {
      panel.current = node;
      const outside = (event: PointerEvent) => {
        if (
          event.target instanceof Node &&
          !node.contains(event.target) &&
          anchorRef.current?.contains(event.target) !== true
        )
          dismiss.current();
      };
      document.addEventListener('pointerdown', outside);
      return () => {
        document.removeEventListener('pointerdown', outside);
        panel.current = null;
      };
    },
    [anchorRef],
  );
  const focusSearch = useMountedResource<HTMLInputElement>((node) => {
    let frame = 0;
    const attempt = (left: number) => {
      node.focus({ preventScroll: true });
      if (node.ownerDocument.activeElement !== node && left > 0)
        frame = requestAnimationFrame(() => attempt(left - 1));
    };
    frame = requestAnimationFrame(() => attempt(5));
    return () => cancelAnimationFrame(frame);
  }, []);
  const needle = query.trim().toLowerCase();
  const matched = options.filter(
    (option) =>
      (filter === allFilter.key ||
        (filter === favoriteKey ? needle !== '' || listed(option) : option.filter === filter)) &&
      (needle === '' ||
        [option.label, option.name ?? '', option.hint ?? '', ...(option.search ?? [])].some(
          (part) => part.toLowerCase().includes(needle),
        )),
  );
  const shown =
    favorites === undefined || filter === favoriteKey
      ? matched
      : [...matched.filter(listed), ...matched.filter((option) => !listed(option))];
  const enabled = busy ? [] : shown.filter((option) => option.disabled !== true);
  const close = () => {
    onClose();
    anchorRef.current?.focus();
  };
  const choose = (next: string) => {
    if (busy) return;
    onSelect(next);
    if (closeOnSelect) close();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (enabled.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const at = enabled.findIndex((option) => option.value === active);
      const next =
        enabled[
          at < 0
            ? step === 1
              ? 0
              : enabled.length - 1
            : (at + step + enabled.length) % enabled.length
        ];
      setActive(next?.value);
      document
        .getElementById(
          `${listId}-${String(shown.findIndex((option) => option.value === next?.value))}`,
        )
        ?.scrollIntoView?.({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const pick = enabled.find((option) => option.value === active) ?? enabled[0];
      if (pick !== undefined) choose(pick.value);
    }
  };
  const activeIndex = shown.findIndex((option) => option.value === active);
  const check = (
    <span {...stylex.props(styles.rowCheck)}>
      <ChannelSidebarIcon name="check" size={14} />
    </span>
  );
  return createPortal(
    <div
      ref={mount}
      role="dialog"
      aria-label={label}
      aria-busy={busy}
      data-filter-picker=""
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        const jump =
          event.ctrlKey && !event.altKey && !event.metaKey && /^[1-9]$/u.test(event.key)
            ? enabled[Number(event.key) - 1]
            : undefined;
        if (jump !== undefined) {
          event.preventDefault();
          event.stopPropagation();
          choose(jump.value);
          return;
        }
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
      data-bh-appearance-owned=""
      {...stylex.props(styles.panel)}
      style={position}
    >
      <div {...stylex.props(styles.body)}>
        {filters.length > 1 || favorites !== undefined ? (
          <div role="group" aria-label={filtersLabel} {...stylex.props(styles.rail)}>
            {[
              ...(favorites === undefined ? [] : [favorites.filter]),
              allFilter,
              ...(filters.length > 1 ? filters : []),
            ].map((entry) => (
              <button
                key={entry.key}
                type="button"
                data-picker-filter={entry.key}
                aria-pressed={filter === entry.key}
                aria-label={entry.label}
                title={entry.label}
                onClick={() => {
                  setFilter(entry.key);
                  setActive(undefined);
                  setHeld(undefined);
                }}
                {...stylex.props(styles.railButton, filter === entry.key && styles.railSelected)}
              >
                {entry.icon}
              </button>
            ))}
          </div>
        ) : null}
        <div {...stylex.props(styles.main)}>
          <div {...stylex.props(styles.search)}>
            <Input
              className={stylex.props(styles.searchInput).className}
              ref={focusSearch}
              icon={<ChannelSidebarIcon name="search" size={14} />}
              autoFocus
              role="combobox"
              aria-label={searchLabel}
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={
                activeIndex < 0 ? undefined : `${listId}-${String(activeIndex)}`
              }
              placeholder={searchLabel}
              value={query}
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(undefined);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <div id={listId} role="listbox" aria-label={label} {...stylex.props(styles.list)}>
            {shown.length === 0 ? (
              <div role="presentation" {...stylex.props(styles.empty)}>
                {emptyLabel}
              </div>
            ) : (
              shown.map((option, index) => {
                const selected = option.value === value;
                const name = option.name ?? option.label;
                const jump = enabled.indexOf(option);
                return (
                  <div key={option.value} role="presentation" {...stylex.props(styles.rowLine)}>
                    <button
                      id={`${listId}-${String(index)}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={selected}
                      aria-label={option.hint === undefined ? name : `${name} · ${option.hint}`}
                      title={name}
                      disabled={busy || option.disabled === true}
                      data-picker-option={option.value}
                      onPointerDown={(event) => event.preventDefault()}
                      onPointerEnter={() => setActive(option.value)}
                      onClick={() => choose(option.value)}
                      {...stylex.props(
                        styles.row,
                        styles.rowMain,
                        option.value === active && styles.rowActive,
                        selected && styles.rowSelected,
                        (busy || option.disabled === true) && styles.rowDisabled,
                      )}
                    >
                      {option.icon === undefined ? null : (
                        <span {...stylex.props(styles.rowIcon)}>{option.icon}</span>
                      )}
                      <span {...stylex.props(styles.rowText)}>
                        <span {...stylex.props(styles.rowName)}>{option.label}</span>
                        {option.hint === undefined ? null : (
                          <span {...stylex.props(styles.rowHint)}>{option.hint}</span>
                        )}
                      </span>
                      {selected ? check : null}
                      {jump >= 0 && jump < 9 ? (
                        <span aria-hidden {...stylex.props(styles.shortcut)}>
                          {`Ctrl+${String(jump + 1)}`}
                        </span>
                      ) : null}
                    </button>
                    {favorites === undefined || option.filter === undefined ? null : (
                      <button
                        type="button"
                        aria-pressed={option.favorite === true}
                        aria-label={`${
                          option.favorite === true ? favorites.removeLabel : favorites.addLabel
                        } · ${name}`}
                        title={
                          option.favorite === true ? favorites.removeLabel : favorites.addLabel
                        }
                        data-picker-favorite={option.value}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setHeld(
                            (current) =>
                              current ??
                              new Set(
                                options
                                  .filter((entry) => entry.favorite === true)
                                  .map((entry) => entry.value),
                              ),
                          );
                          favorites.onToggle(option.value, option.favorite !== true);
                        }}
                        {...stylex.props(
                          styles.star,
                          (option.favorite === true || option.value === active) && styles.starShown,
                          option.favorite === true && styles.starOn,
                        )}
                      >
                        <ChannelSidebarIcon
                          name="star"
                          size={14}
                          filled={option.favorite === true}
                        />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        {side === undefined || side.options.length <= 1 ? null : (
          <div role="radiogroup" aria-label={side.label} {...stylex.props(styles.efforts)}>
            <div {...stylex.props(styles.effortsTitle)}>{side.label}</div>
            {side.options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={option.value === side.value}
                disabled={busy}
                data-picker-side={option.value}
                onClick={() => side.onSelect(option.value)}
                {...stylex.props(styles.row, option.value === side.value && styles.rowSelected)}
              >
                <span {...stylex.props(styles.rowName)}>{option.label}</span>
                <span {...stylex.props(styles.grow)} />
                {option.value === side.value ? check : null}
              </button>
            ))}
          </div>
        )}
      </div>
      {notice === undefined ? null : (
        <div role="alert" {...stylex.props(styles.notice)}>
          {notice}
        </div>
      )}
      {footer === undefined ? null : (
        <div {...stylex.props(styles.footer)}>
          <button
            type="button"
            data-picker-footer=""
            onClick={() => {
              onClose();
              footer.onSelect();
            }}
            {...stylex.props(styles.footerButton)}
          >
            {footer.icon}
            {footer.label}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
