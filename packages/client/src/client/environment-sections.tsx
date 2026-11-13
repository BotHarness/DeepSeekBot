import { useRef, useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  assignRosterChannel,
  createRosterSection,
  renameRosterSection,
  reorderRosterSections,
  type BridgeCall,
  errorMessage,
} from './bridge.js';
import { FormDialog } from './ds/form-dialog.js';
import { Field, TextField } from './ds/field.js';
import { Select } from './ds/select.js';
import { HostMark, useRemoteHosts } from './host-tabs.js';
import { useHostName } from './host-looks.js';
import { remoteHosts } from './remote-hosts.js';
import type { BotHarnessTranslate } from './locale.js';

export function EnvironmentSections({
  host,
  t,
  onClose,
}: {
  host: { id: string; name: string };
  t: BotHarnessTranslate;
  onClose: () => void;
}): ReactElement {
  const state = useRemoteHosts();
  const remote = state.hosts.find((entry) => entry.host.hostId === host.id);
  const name = useHostName(host.id, host.name);
  const [client] = useState(() => remoteHosts().client(host.id));
  const sameClient = client !== undefined && remoteHosts().client(host.id) === client;
  const [draft, setDraft] = useState('');
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string>();
  const [creationUnknown, setCreationUnknown] = useState(false);
  const sections = remote?.snapshot.roster?.arrangement?.sections ?? [];
  const online = sameClient && remote?.snapshot.connection.status === 'connected';
  const channels = [
    ...(remote?.snapshot.roster?.bots ?? []).flatMap((bot) =>
      bot.dmChannelId ? [{ id: bot.dmChannelId, name: bot.displayName }] : [],
    ),
    ...(remote?.snapshot.roster?.channels ?? []),
  ];
  const mutate = async (work: (call: BridgeCall) => Promise<unknown>): Promise<void> => {
    if (pending.current) return;
    if (!online || !client) {
      setError(t(sameClient ? 'environment.create.offline' : 'environment.create.changed'));
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await work(async (method, args) => {
        if (remoteHosts().client(host.id) !== client)
          throw new Error(t('environment.create.changed'));
        return { ok: true, value: await client.call(method, args) };
      });
      await client.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <FormDialog
      title={t('environment.sections.title')}
      labels={{ close: t('common.close'), cancel: t('common.close') }}
      submitLabel={t('common.close')}
      onCancel={() => {
        if (!busy) onClose();
      }}
      busy={busy}
      error={error}
      scroll
    >
      <span>
        <HostMark hostId={host.id} /> {name}
      </span>
      {!online ? (
        <span role="status">
          {t(sameClient ? 'environment.create.offline' : 'environment.create.changed')}
        </span>
      ) : null}
      <TextField
        label={t('section.name.label')}
        value={draft}
        onChange={setDraft}
        disabled={busy || !online || creationUnknown}
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy || !online || creationUnknown || !draft.trim()}
        onClick={() =>
          void mutate(async (call) => {
            try {
              await createRosterSection(call, draft.trim());
              setDraft('');
            } catch (cause) {
              setCreationUnknown(true);
              await client?.refresh().catch(() => {});
              throw cause;
            }
          })
        }
      >
        {t('roster.menu.createSection')}
      </Button>
      {creationUnknown ? (
        <>
          <span role="status">{t('environment.sections.unknown')}</span>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !online}
            onClick={() => void mutate(async () => {})}
          >
            {t('environment.sections.refresh')}
          </Button>
        </>
      ) : null}
      {sections.map((section, index) => (
        <section key={section.id} aria-label={section.name}>
          <TextField
            label={t('environment.sections.rename', { name: section.name })}
            value={renames[section.id] ?? section.name}
            disabled={busy || !online}
            onChange={(value) => setRenames((current) => ({ ...current, [section.id]: value }))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            onBlur={() => {
              const value = renames[section.id]?.trim();
              if (value && value !== section.name)
                void mutate((call) => renameRosterSection(call, section.id, value));
            }}
          />
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !online || index === 0}
            onClick={() =>
              void mutate((call) => {
                const order = sections.map((entry) => entry.id);
                const previous = order[index - 1];
                if (previous === undefined) return Promise.resolve();
                order[index - 1] = section.id;
                order[index] = previous;
                return reorderRosterSections(call, order);
              })
            }
          >
            {t('environment.sections.up', { name: section.name })}
          </Button>
          {section.channelIds.flatMap((id, memberIndex) => {
            const channel = channels.find((entry) => entry.id === id);
            return channel
              ? [
                  <div key={id}>
                    <span>{channel.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy || !online || memberIndex === 0}
                      onClick={() =>
                        void mutate((call) =>
                          assignRosterChannel(call, id, section.id, memberIndex - 1),
                        )
                      }
                    >
                      {t('environment.sections.up', { name: channel.name })}
                    </Button>
                  </div>,
                ]
              : [];
          })}
        </section>
      ))}
      {channels.map((channel) => (
        <Field key={channel.id} label={channel.name}>
          {() => (
            <Select
              label={t('environment.sections.move', { name: channel.name })}
              value={sections.find((section) => section.channelIds.includes(channel.id))?.id ?? ''}
              options={[
                { value: '', label: t('environment.sections.ungrouped') },
                ...sections.map((section) => ({ value: section.id, label: section.name })),
              ]}
              disabled={busy || !online}
              onChange={(id) =>
                void mutate((call) => assignRosterChannel(call, channel.id, id || undefined))
              }
            />
          )}
        </Field>
      ))}
    </FormDialog>
  );
}
