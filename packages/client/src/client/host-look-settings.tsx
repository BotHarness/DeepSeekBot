import { useRef, useState, type ReactElement } from 'react';
import { useMountedResource } from './mounted-resource.js';
import { hostSettingsDrafts } from './host-settings-drafts.js';
import { ActionButton } from './ds/action-button.js';
import * as stylex from '@stylexjs/stylex';
import { Note } from './ds/note.js';
import { Input } from './ds/input.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { radius, size, space } from './ds/tobs.stylex.js';
import { PreviewChoices } from './ds/preview-choice.js';
import { Icon } from './ds/icon.js';
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

const styles = stylex.create({
  recovery: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.x3,
  },
  nameField: { boxSizing: 'border-box', width: '200px', maxWidth: '100%', minWidth: 0 },
  swatch: (value: string) => ({
    display: 'block',
    width: size.icon,
    height: size.icon,
    borderRadius: radius.full,
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
      {error || storageError ? (
        <div {...stylex.props(styles.recovery)}>
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
      <SettingsRow title={t('remoteHosts.look.symbols')}>
        <PreviewChoices
          variant="glyph"
          label={t('remoteHosts.look.symbols')}
          value={icon.kind === 'symbol' ? icon.id : undefined}
          options={HOST_SYMBOL_IDS.map((id) => ({
            id,
            label: t(`remoteHosts.look.symbol.${id}`),
            preview: <HostGlyph look={{ ...look, icon: { kind: 'symbol', id } }} />,
            data: { 'data-host-look-symbol': id },
          }))}
          onChange={(id) => void change((current) => withHostIcon(current, { kind: 'symbol', id }))}
        />
      </SettingsRow>
      <SettingsRow title={t('remoteHosts.look.emoji')}>
        <PreviewChoices
          variant="glyph"
          label={t('remoteHosts.look.emoji')}
          value={icon.kind === 'emoji' ? icon.emoji : undefined}
          options={HOST_EMOJI.map((emoji) => ({ id: emoji, label: emoji, preview: emoji }))}
          onChange={(emoji) =>
            void change((current) => withHostIcon(current, { kind: 'emoji', emoji }))
          }
        />
      </SettingsRow>
      <SettingsRow title={t('remoteHosts.look.color')}>
        <PreviewChoices<(typeof HOST_COLOR_IDS)[number] | 'none'>
          variant="glyph"
          label={t('remoteHosts.look.color')}
          value={look.color ?? 'none'}
          options={[
            { id: 'none', label: t('remoteHosts.look.noColor'), preview: <Icon name="ban" /> },
            ...HOST_COLOR_IDS.map((id) => ({
              id,
              label: t(`remoteHosts.look.color.${id}`),
              preview: <span {...stylex.props(styles.swatch(HOST_COLORS[id][scheme]))} />,
            })),
          ]}
          onChange={(id) =>
            void change((current) => withHostColor(current, id === 'none' ? undefined : id))
          }
        />
      </SettingsRow>
    </SettingsSection>
  );
}
