import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  IconChevronRightOutlineRegular,
  Menu,
  MenuItemButton,
  MenuSurface,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { ChannelSidebarEntry, ChannelSidebarEntryProps } from './channel-sidebar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';

const SubmenuContext = createContext<{
  active: string | undefined;
  show(id: string, preview?: () => void): void;
  hide(id: string): void;
}>({ active: undefined, show: () => {}, hide: () => {} });

export function SettingsSubmenu({
  label,
  children,
  onPreview,
}: {
  label: string;
  children: ReactNode;
  onPreview?: (() => void) | undefined;
}): ReactElement {
  const id = useId();
  const context = useContext(SubmenuContext);
  const open = context.active === id;
  const anchor = useRef<HTMLButtonElement>(null);
  const show = () => context.show(id, onPreview);
  return (
    <div
      className="bh-sidebar-settings-group"
      onMouseEnter={show}
      onMouseLeave={() => context.hide(id)}
      onFocusCapture={show}
    >
      <button
        ref={anchor}
        type="button"
        role="menuitem"
        className="bh-sidebar-settings-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={show}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight') return;
          event.preventDefault();
          show();
          setTimeout(
            () =>
              anchor.current
                ?.closest('.bh-sidebar-settings-group')
                ?.querySelector<HTMLElement>(':scope [role="menu"] [role="menuitem"]')
                ?.focus(),
            0,
          );
        }}
      >
        <span>{label}</span>
        <IconChevronRightOutlineRegular size={14} />
      </button>
      {open ? (
        <MenuSurface role="menu" className="bh-sidebar-settings-options">
          <div
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft') return;
              event.preventDefault();
              event.stopPropagation();
              anchor.current?.focus();
            }}
          >
            {children}
          </div>
        </MenuSurface>
      ) : null}
    </div>
  );
}

export function ChannelSidebarSettings({
  entries,
  entryProps,
  onEdit,
  editing = false,
  onPreview,
}: {
  onPreview?: ((entryId: string | undefined) => void) | undefined;
  onEdit?: () => void;
  editing?: boolean;
  entries: readonly ChannelSidebarEntry[];
  entryProps: ChannelSidebarEntryProps;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | undefined>();
  const anchor = useRef<HTMLButtonElement>(null);
  const settings = entries.filter((entry) => entry.settings !== undefined);
  const close = () => {
    setOpen(false);
    setActive(undefined);
    onPreview?.(undefined);
  };
  const label = entryProps.t('sidebar.settings');
  return (
    <SubmenuContext.Provider
      value={{
        active,
        show: (id, preview) => {
          setActive(id);
          preview?.();
        },
        hide: (id) => {
          if (active === id) {
            setActive(undefined);
            onPreview?.(undefined);
          }
        },
      }}
    >
      <Menu
        open={open}
        portal
        dense
        autoFocus
        align="end"
        className="bh-sidebar-settings-menu"
        listClassName="bh-sidebar-settings-list"
        getAnchorRect={() => anchor.current?.getBoundingClientRect() ?? null}
        anchor={
          <Tooltip label={label} side="bottom" delayMs={500}>
            <button
              ref={anchor}
              type="button"
              className="bh-sidebar-toggle bh-sidebar-settings"
              disabled={editing}
              aria-label={label}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => (open ? close() : setOpen(true))}
            >
              <ChannelSidebarIcon name="settings" />
            </button>
          </Tooltip>
        }
        onClose={close}
      >
        {onEdit === undefined ? null : (
          <MenuItemButton
            onSelect={() => {
              close();
              onEdit();
            }}
          >
            {entryProps.t('sidebar.order.edit')}
          </MenuItemButton>
        )}
        {settings.map((entry) => {
          const Settings = entry.settings!;
          return (
            <Settings
              key={entry.id}
              {...entryProps}
              onClose={close}
              onPreview={() => onPreview?.(entry.id)}
            />
          );
        })}
        {settings.length === 0 && onEdit === undefined ? (
          <MenuItemButton disabled onSelect={close}>
            {entryProps.t('sidebar.settings.empty')}
          </MenuItemButton>
        ) : null}
      </Menu>
    </SubmenuContext.Provider>
  );
}
