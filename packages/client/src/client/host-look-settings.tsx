import { useRef, useState, type ReactElement } from 'react';
import { useMountedResource } from './mounted-resource.js';
import { hostSettingsDrafts } from './host-settings-drafts.js';
import { ActionButton } from './ds/action-button.js';
import * as stylex from '@stylexjs/stylex';
import { Note } from './ds/note.js';
import { Input } from './ds/input.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { HostGlyph } from './host-glyph.js';
import { hostLooks, useHostLook, useHostLookError } from './host-looks.js';
import { useBotColorScheme } from './bot-color-scheme.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  HOST_COLOR_IDS,
  HOST_COLORS,
  HOST_EMOJI,
  HOST_SYMBOL_IDS,
  HOST_NAME_MAX,
  hostLookName,
  withHostName,
  withHostIcon,
  withHostColor,
  type HostLook,
} from '@botharness/host-client/ui/design/host-look';

const focusRing = { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` };
const styles = stylex.create({
  nameField: { boxSizing: 'border-box', width: '200px', maxWidth: '100%', minWidth: 0 },
  editor: { display: 'flex', flexDirection: 'column', gap: space.x5 },
  emoji: { fontSize: text.titleSize, lineHeight: text.metaLine },
  section: { display: 'flex', flexDirection: 'column', gap: space.x2 },
  sectionName: { color: color.subtle, fontSize: text.metaSize, lineHeight: text.metaLine },
  grid: { display: 'flex', flexWrap: 'wrap', gap: space.x1 },
  choice: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size.icon,
    height: size.icon,
    padding: 0,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    cursor: 'pointer',
    outline: focusRing,
    outlineOffset: '-2px',
  },
  chosen: { borderColor: color.accent, backgroundColor: color.selected },
  swatch: (value: string) => ({
    width: text.titleSize,
    height: text.titleSize,
    borderRadius: radius.round,
    backgroundColor: value,
  }),
});

function HostNameField({
  hostId,
  name,
  saved,
  change,
  t,
}: {
  hostId: string;
  name: string;
  saved: string | undefined;
  change: (transform: (current: HostLook) => HostLook) => Promise<boolean>;
  t: BotHarnessTranslate;
}) {
  const [draft, setDraft] = useState(saved ?? '');
  const draftValue = useRef(draft);
  const savedValue = useRef(saved ?? '');
  const observedSaved = useRef(saved ?? '');
  if (observedSaved.current !== (saved ?? '')) {
    const previous = observedSaved.current;
    observedSaved.current = saved ?? '';
    savedValue.current = saved ?? '';
    if (draftValue.current === previous) {
      draftValue.current = savedValue.current;
      setDraft(savedValue.current);
    }
  }
  const pendingSave = useRef<Promise<boolean>>();
  const save = async () => {
    if (pendingSave.current) return pendingSave.current;
    if (draftValue.current === savedValue.current) return true;
    const name = draftValue.current;
    const operation = (async () => {
      if (await change((current) => withHostName(current, name))) {
        savedValue.current = hostLookName(name) ?? '';
        if (draftValue.current === name) {
          draftValue.current = savedValue.current;
          setDraft(savedValue.current);
        }
        return true;
      }
      return false;
    })();
    pendingSave.current = operation;
    try {
      return await operation;
    } finally {
      pendingSave.current = undefined;
    }
  };
  const discard = () => {
    draftValue.current = savedValue.current;
    setDraft(savedValue.current);
  };
  const current = useRef({ dirty: () => draftValue.current !== savedValue.current, save, discard });
  current.current = { dirty: () => draftValue.current !== savedValue.current, save, discard };
  const mount = useMountedResource<HTMLDivElement>(
    () =>
      hostSettingsDrafts.register(hostId, {
        dirty: () => current.current.dirty(),
        save: () => current.current.save(),
        discard: () => current.current.discard(),
      }),
    [hostId],
  );
  return (
    <SettingsRow
      rootRef={mount}
      title={<label htmlFor={`bh-host-name-${hostId}`}>{t('remoteHosts.look.name')}</label>}
      description={t('remoteHosts.look.nameHint')}
      control={
        <Input
          id={`bh-host-name-${hostId}`}
          className={stylex.props(styles.nameField).className ?? ''}
          value={draft}
          onChange={(event) => {
            draftValue.current = event.currentTarget.value;
            setDraft(event.currentTarget.value);
          }}
          placeholder={name}
          maxLength={HOST_NAME_MAX}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void save();
          }}
        />
      }
    />
  );
}

export function HostLookSettings({
  hostId,
  name,
  available = true,
  title,
  t,
}: {
  hostId: string;
  name: string;
  available?: boolean;
  title?: string | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const scheme = useBotColorScheme();
  const look = useHostLook(hostId);
  const icon = look.icon;
  const [error, setError] = useState(false);
  const storageError = useHostLookError();
  const change = async (transform: (current: HostLook) => HostLook): Promise<boolean> => {
    if (!available) return false;
    try {
      await hostLooks().update(hostId, transform);
      setError(false);
      return true;
    } catch {
      setError(true);
      return false;
    }
  };
  const refresh = async () => {
    try {
      await hostLooks().refresh();
      setError(false);
    } catch {
      setError(true);
    }
  };
  return (
    <SettingsSection title={title}>
      <div {...stylex.props(styles.editor)}>
        {error || storageError ? (
          <div {...stylex.props(styles.section)}>
            <Note tone="danger">
              {t(
                storageError === 'host-look-lock-unavailable'
                  ? 'remoteHosts.look.unsupported'
                  : 'remoteHosts.look.failed',
              )}
            </Note>
            <ActionButton
              icon="refresh"

              onClick={() => {
                void refresh();
              }}
            >
              {t('remoteHosts.look.refresh')}
            </ActionButton>
          </div>
        ) : null}
        <HostNameField hostId={hostId} name={name} saved={look.name} change={change} t={t} />
        <div {...stylex.props(styles.section)}>
          <span {...stylex.props(styles.sectionName)}>{t('remoteHosts.look.symbols')}</span>
          <div
            {...stylex.props(styles.grid)}
            role="radiogroup"
            aria-label={t('remoteHosts.look.symbols')}
          >
            {HOST_SYMBOL_IDS.map((id) => {
              const chosen = icon.kind === 'symbol' && icon.id === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  aria-label={t(`remoteHosts.look.symbol.${id}`)}
                  data-host-look-symbol={id}
                  {...stylex.props(styles.choice, chosen && styles.chosen)}
                  onClick={() =>
                    void change((current) => withHostIcon(current, { kind: 'symbol', id }))
                  }
                >
                  <HostGlyph look={{ ...look, icon: { kind: 'symbol', id } }} />
                </button>
              );
            })}
          </div>
        </div>
        <div {...stylex.props(styles.section)}>
          <span {...stylex.props(styles.sectionName)}>{t('remoteHosts.look.emoji')}</span>
          <div
            {...stylex.props(styles.grid)}
            role="radiogroup"
            aria-label={t('remoteHosts.look.emoji')}
          >
            {HOST_EMOJI.map((emoji) => {
              const chosen = icon.kind === 'emoji' && icon.emoji === emoji;
              return (
                <button
                  key={emoji}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  aria-label={emoji}
                  {...stylex.props(styles.choice, chosen && styles.chosen)}
                  onClick={() =>
                    void change((current) => withHostIcon(current, { kind: 'emoji', emoji }))
                  }
                >
                  <span {...stylex.props(styles.emoji)}>{emoji}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div {...stylex.props(styles.section)}>
          <span {...stylex.props(styles.sectionName)}>{t('remoteHosts.look.color')}</span>
          <div
            {...stylex.props(styles.grid)}
            role="radiogroup"
            aria-label={t('remoteHosts.look.color')}
          >
            <button
              type="button"
              role="radio"
              aria-checked={look.color === undefined}
              aria-label={t('remoteHosts.look.noColor')}
              {...stylex.props(styles.choice, look.color === undefined && styles.chosen)}
              onClick={() => void change((current) => withHostColor(current, undefined))}
            >
              <ChannelSidebarIcon name="ban" size={14} />
            </button>
            {HOST_COLOR_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={look.color === id}
                aria-label={t(`remoteHosts.look.color.${id}`)}
                {...stylex.props(styles.choice, look.color === id && styles.chosen)}
                onClick={() => void change((current) => withHostColor(current, id))}
              >
                <span {...stylex.props(styles.swatch(HOST_COLORS[id][scheme]))} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
