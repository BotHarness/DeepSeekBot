import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import { useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import {
  IconChevronDownOutlineRegular,
  IconPlusOutlineRegular,
  Input,
  MenuSurface,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives';

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly disabled?: boolean | undefined;
}

export const COMBOBOX_CSS = `
.bh-combobox { position: relative; flex: 1; min-width: 0; }
.bh-combobox-input { display: flex; padding-right: ${space.x6}; }
.bh-combobox input { width: 100%; text-overflow: ellipsis; }
.bh-combobox input[readonly] { cursor: pointer; }
.bh-combobox-toggle {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: ${radius.sm}; padding: 0;
  color: var(--dsw-alias-label-secondary); background: transparent; cursor: pointer;
}
.bh-combobox-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-combobox-toggle:disabled { opacity: 0.5; cursor: default; }
.bh-combobox-list {
  position: fixed; z-index: 1100; box-sizing: border-box;
  background: var(--dsw-alias-bg-base);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
}
.bh-combobox-scroll > button {
  display: flex; align-items: baseline; justify-content: space-between; gap: ${space.x4};
  width: 100%; min-height: 34px; padding: ${space.x2} ${space.x3};
  border: 0; border-radius: ${radius.sm}; background: transparent;
  color: var(--dsw-alias-label-primary); text-align: left; font: inherit; font-size: ${text.bodySize}; line-height: ${text.bodyLine}; cursor: pointer;
  overflow-wrap: anywhere;
}
.bh-combobox-scroll > button[aria-selected="true"] { font-weight: ${text.strong}; }
.bh-combobox-scroll > button:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.bh-combobox-scroll > button:not(:disabled):hover, .bh-combobox-scroll > button[data-active] {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-combobox-scroll { max-height: 260px; overflow-y: auto; padding: ${space.x2}; box-sizing: border-box; }
.bh-combobox-hint { flex: none; color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; font-weight: ${text.regular}; }
.bh-combobox-empty { padding: ${space.x2} ${space.x3}; color: var(--dsw-alias-label-secondary); font-size: ${text.bodySize}; }
.bh-combobox-scroll > .bh-combobox-action { justify-content: flex-start; align-items: center; gap: ${space.x2}; border-top: ${border.hairline} solid ${color.divider}; border-radius: 0; margin-top: ${space.x2}; }
`;

export function Combobox({
  value,
  options,
  onSelect,
  label,
  toggleLabel,
  disabled = false,
  invalid = false,
  errorId,
  placeholder,
  emptyLabel,
  fallbackValue,
  createLabel,
  searchable = true,
  className,
  action,
}: {
  readonly value: string;
  readonly options: readonly ComboboxOption[];
  readonly onSelect: (value: string) => void;
  readonly label: string;
  readonly toggleLabel: string;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly errorId?: string;
  readonly placeholder?: string;
  readonly emptyLabel?: string;
  readonly fallbackValue?: string;
  readonly createLabel?: (query: string) => string;
  readonly searchable?: boolean;
  readonly className?: string;
  readonly action?: {
    readonly label: string;
    readonly onSelect: () => void;
    readonly disabled?: boolean;
  };
}): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const actionValue = `${listId}-action`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | undefined>(undefined);
  const [active, setActive] = useState<string | undefined>(undefined);
  const current = value === '' && fallbackValue !== undefined ? fallbackValue : value;
  const display = options.find((option) => option.value === current)?.label ?? current;
  const trimmed = query?.trim() ?? '';
  const needle = trimmed.toLowerCase();
  const matches: ComboboxOption[] = options.filter((option) =>
    [option.label, option.value, option.hint ?? ''].some((text) =>
      text.toLowerCase().includes(needle),
    ),
  );
  const canCreate =
    createLabel !== undefined &&
    trimmed !== '' &&
    !options.some((option) => option.value === trimmed);
  const choices: ComboboxOption[] = canCreate
    ? [...matches, { value: trimmed, label: createLabel(trimmed) }]
    : matches;
  const shown =
    action === undefined
      ? choices
      : [...choices, { value: actionValue, label: action.label, disabled: action.disabled }];
  const enabled = shown.filter((option) => option.disabled !== true);
  const hasPopup = shown.length > 0 || (choices.length === 0 && emptyLabel !== undefined);
  const highlighted = shown.findIndex(
    (option) => option.value === active && option.disabled !== true,
  );
  const position = useAnchoredPosition({
    open,
    anchorRef: root,
    panelRef: panel,
    gap: 4,
    margin: 12,
  });
  useDismissOnOutsidePointer(root, open, setOpen, panel);

  const dismiss = (): void => {
    setOpen(false);
    setQuery(undefined);
    setActive(undefined);
  };
  const select = (next: string): void => {
    dismiss();
    if (action !== undefined && next === actionValue) action.onSelect();
    else onSelect(next);
  };
  const typedChoice = (): string | undefined => {
    if (query === undefined) return current === '' ? undefined : current;
    if (trimmed === '') return fallbackValue;
    if (createLabel !== undefined) return trimmed;
    const available = matches.filter((option) => option.disabled !== true);
    const exact = available.find(
      (option) => option.value.toLowerCase() === needle || option.label.toLowerCase() === needle,
    );
    return (exact ?? available[0])?.value;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (enabled.length === 0) return;
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      const at = enabled.findIndex((option) => option.value === active);
      const next =
        enabled[
          at < 0
            ? offset === 1
              ? 0
              : enabled.length - 1
            : (at + offset + enabled.length) % enabled.length
        ];
      setActive(next?.value);
      const index = shown.findIndex((option) => option.value === next?.value);
      document.getElementById(`${listId}-${index}`)?.scrollIntoView?.({ block: 'nearest' });
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      const choice = shown[highlighted]?.value ?? typedChoice();
      if (choice === undefined) dismiss();
      else select(choice);
    }
  };

  return (
    <div
      className={className === undefined ? 'bh-combobox' : `bh-combobox ${className}`}
      ref={root}
    >
      <Input
        className="bh-combobox-input"
        role="combobox"
        aria-label={label}
        aria-expanded={open && hasPopup}
        aria-autocomplete="list"
        aria-controls={open && hasPopup ? listId : undefined}
        aria-activedescendant={
          open && hasPopup && highlighted >= 0 ? `${listId}-${highlighted}` : undefined
        }
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        value={query ?? display}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        readOnly={!searchable}
        data-searchable={searchable || undefined}
        onFocus={(event) => {
          if (searchable) event.currentTarget.select();
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(undefined);
          setOpen(true);
        }}
        onBlur={dismiss}
        onKeyDown={onKeyDown}
      />
      <button
        className="bh-combobox-toggle"
        type="button"
        aria-label={toggleLabel}
        disabled={disabled}
        tabIndex={-1}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          if (open) dismiss();
          else {
            root.current?.querySelector('input')?.focus();
            setOpen(true);
          }
        }}
      >
        <IconChevronDownOutlineRegular size={16} />
      </button>
      {open && !disabled && hasPopup
        ? createPortal(
            <MenuSurface
              compact
              ref={panel}
              id={listId}
              role="listbox"
              aria-label={label}
              className="bh-combobox-list"
              data-bh-appearance-owned=""
              style={{
                ...position,
                width: root.current?.getBoundingClientRect().width ?? 200,
                visibility: position === null ? 'hidden' : undefined,
              }}
            >
              <div className="bh-combobox-scroll">
                {choices.length === 0 && emptyLabel !== undefined ? (
                  <div className="bh-combobox-empty">{emptyLabel}</div>
                ) : null}
                {shown.map((option, index) => (
                  <button
                    key={option.value}
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={option.value !== actionValue && option.value === current}
                    className={option.value === actionValue ? 'bh-combobox-action' : undefined}
                    data-action={option.value === actionValue || undefined}
                    data-value={option.value}
                    data-active={index === highlighted || undefined}
                    disabled={option.disabled}
                    tabIndex={-1}
                    onPointerDown={(event) => event.preventDefault()}
                    onMouseEnter={() => {
                      if (option.disabled !== true) setActive(option.value);
                    }}
                    onClick={() => select(option.value)}
                  >
                    {option.value === actionValue ? <IconPlusOutlineRegular size={16} /> : null}
                    {option.label}
                    {option.hint === undefined ? null : (
                      <span className="bh-combobox-hint">{option.hint}</span>
                    )}
                  </button>
                ))}
              </div>
            </MenuSurface>,
            document.body,
          )
        : null}
    </div>
  );
}
