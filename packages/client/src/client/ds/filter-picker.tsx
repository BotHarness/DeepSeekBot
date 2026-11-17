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
    width: 'min(560px, calc(100vw - 24px))',
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
  railSelected: { backgroundColor: color.selected, color: color.fg },
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
  anchorRef: RefObject<HTMLElement | null>;
  onClose(): void;
}): ReactElement {
  const listId = useId();
  const panel = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState(allFilter.key);
  const [query, setQuery] = useState('');
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
  const needle = query.trim().toLowerCase();
  const shown = options.filter(
    (option) =>
      (filter === allFilter.key || option.filter === filter) &&
      (needle === '' ||
        [option.label, option.name ?? '', option.hint ?? '', ...(option.search ?? [])].some(
          (part) => part.toLowerCase().includes(needle),
        )),
  );
  const enabled = shown.filter((option) => option.disabled !== true);
  const choose = (next: string) => {
    onSelect(next);
    if (closeOnSelect) onClose();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      anchorRef.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
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
      data-filter-picker=""
      data-bh-appearance-owned=""
      {...stylex.props(styles.panel)}
      style={position}
    >
      <div {...stylex.props(styles.body)}>
        {filters.length > 1 ? (
          <div role="group" aria-label={filtersLabel} {...stylex.props(styles.rail)}>
            {[allFilter, ...filters].map((entry) => (
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
                return (
                  <button
                    key={option.value}
                    id={`${listId}-${String(index)}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={selected}
                    aria-label={option.hint === undefined ? name : `${name} · ${option.hint}`}
                    title={name}
                    disabled={option.disabled === true}
                    data-picker-option={option.value}
                    onPointerDown={(event) => event.preventDefault()}
                    onPointerEnter={() => setActive(option.value)}
                    onClick={() => choose(option.value)}
                    {...stylex.props(
                      styles.row,
                      option.value === active && styles.rowActive,
                      selected && styles.rowSelected,
                      option.disabled === true && styles.rowDisabled,
                    )}
                  >
                    {option.icon === undefined ? null : (
                      <span {...stylex.props(styles.rowIcon)}>{option.icon}</span>
                    )}
                    <span {...stylex.props(styles.rowName)}>{option.label}</span>
                    {option.hint === undefined ? null : (
                      <span {...stylex.props(styles.rowHint)}>{option.hint}</span>
                    )}
                    <span {...stylex.props(styles.grow)} />
                    {selected ? check : null}
                  </button>
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
