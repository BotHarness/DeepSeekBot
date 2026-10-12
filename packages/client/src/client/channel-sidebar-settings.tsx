import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
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
import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
  ChannelSidebarSettingsProps,
} from './channel-sidebar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { channelSidebarPrefs } from './channel-sidebar-prefs.js';
import {
  sessionViewPreferenceSnapshot,
  subscribeSessionViewPreference,
  updateSessionViewPreference,
} from './session-view-prefs.js';

const SubmenuContext = createContext<{
  active: string | undefined;
  show(id: string, preview?: () => void): void;
  hide(id: string): void;
}>({ active: undefined, show: () => {}, hide: () => {} });

function SettingsSubmenu({
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

export function SessionsDisplaySettings({
  botSlug,
  t,
  onPreview,
}: ChannelSidebarSettingsProps): ReactElement {
  const slug = botSlug ?? '';
  const preference = useSyncExternalStore(
    (listener) => subscribeSessionViewPreference(slug, listener),
    () => sessionViewPreferenceSnapshot(slug),
    () => sessionViewPreferenceSnapshot(slug),
  );
  return (
    <>
      <SettingsSubmenu
        label={t('entry.sessions') + ' · ' + t('sessions.view')}
        onPreview={onPreview}
      >
        {(['current', 'all'] as const).map((scope) => (
          <MenuItemButton
            key={scope}
            icon={preference.scope === scope ? <ChannelSidebarIcon name="check" /> : undefined}
            onSelect={() => {
              updateSessionViewPreference(slug, (current) => ({ ...current, scope }));
            }}
          >
            {t(scope === 'current' ? 'sessions.current' : 'sessions.all')}
          </MenuItemButton>
        ))}
      </SettingsSubmenu>
      <SettingsSubmenu
        label={t('entry.sessions') + ' · ' + t('sessions.layout')}
        onPreview={onPreview}
      >
        {(['flat', 'workspace'] as const).map((layout) => (
          <MenuItemButton
            key={layout}
            icon={preference.layout === layout ? <ChannelSidebarIcon name="check" /> : undefined}
            onSelect={() => {
              updateSessionViewPreference(slug, (current) => ({ ...current, layout }));
            }}
          >
            {t(layout === 'flat' ? 'sessions.layout.flat' : 'sessions.layout.workspace')}
          </MenuItemButton>
        ))}
      </SettingsSubmenu>
    </>
  );
}

export function MemoryDisplaySettings({ t, onPreview }: ChannelSidebarSettingsProps): ReactElement {
  const terminology = useSyncExternalStore(
    channelSidebarPrefs.subscribe,
    () => channelSidebarPrefs.getSnapshot().memoryTerminology,
    () => channelSidebarPrefs.getSnapshot().memoryTerminology,
  );
  return (
    <SettingsSubmenu
      label={t('entry.memoryEvolution') + ' · ' + t('memory.terminology')}
      onPreview={onPreview}
    >
      {(['memory', 'git'] as const).map((term) => (
        <MenuItemButton
          key={term}
          icon={terminology === term ? <ChannelSidebarIcon name="check" /> : undefined}
          onSelect={() => {
            channelSidebarPrefs.setMemoryTerminology(term);
          }}
        >
          {t(term === 'memory' ? 'memory.terms.memory' : 'memory.terms.git')}
        </MenuItemButton>
      ))}
    </SettingsSubmenu>
  );
}

export function ChannelSidebarSettings({
  entries,
  entryProps,
  onEdit,
  editing = false,
  onPreview,
  onOpenSettings,
}: {
  onPreview?: ((entryId: string | undefined) => void) | undefined;
  onOpenSettings?: (() => void) | undefined;
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
        {onOpenSettings === undefined ? null : (
          <MenuItemButton
            onSelect={() => {
              close();
              onOpenSettings();
            }}
          >
            {entryProps.t('channelSettings.open')}
          </MenuItemButton>
        )}
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
        {settings.length === 0 && onEdit === undefined && onOpenSettings === undefined ? (
          <MenuItemButton disabled onSelect={close}>
            {entryProps.t('sidebar.settings.empty')}
          </MenuItemButton>
        ) : null}
      </Menu>
    </SubmenuContext.Provider>
  );
}
