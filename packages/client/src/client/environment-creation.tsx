import { useRef, useState, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import { Field } from './ds/field.js';
import { Select } from './ds/select.js';
import { useRemoteHosts, HostMark } from './host-tabs.js';
import { remoteHosts } from './remote-hosts.js';
import { memberPage } from './member-page.js';
import { useThisHost } from './this-host.js';
import { hostLooks, useHostName } from './host-looks.js';
import { shownHostName } from '../../../../apps/mobile/src/ui/design/host-look.js';
import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import {
  bindBotCreationOwner,
  localCreationOwner,
  remoteCreationOwner,
} from './environment-creation-owner.js';
import { CreatePersonaBotModal } from './persona-bot-create.js';
import { CreateChannelModal } from './section-management.js';
import { MessagePersonDialog } from './message-person-dialog.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  creationStorage,
  initialCreationHost,
  lastCreationHost,
  rememberCreationHost,
  type CreationHost,
} from './environment-creation-target.js';

export type EnvironmentCreateRequest =
  | { kind: 'bot'; source: 'empty' | 'git'; sectionId?: string }
  | { kind: 'channel'; sectionId?: string }
  | { kind: 'human-dm' };

export function EnvironmentCreation(
  props: Parameters<typeof OwnerEnvironmentCreation>[0],
): ReactElement {
  if (!memberPage()) return <OwnerEnvironmentCreation {...props} />;
  const { request, actions, t, onClose, sectionName } = props;
  if (request.kind === 'human-dm')
    return (
      <MessagePersonDialog
        call={actions.teamCall}
        t={t}
        onClose={onClose}
        unavailable={actions.teamCall === undefined}
        onOpened={async (channelId, _person, signal) => {
          await actions.refreshRoster();
          signal.throwIfAborted();
          await actions.openChannel(channelId);
          if (!signal.aborted) onClose();
        }}
      />
    );
  if (request.kind === 'channel')
    return (
      <CreateChannelModal
        t={t}
        sectionName={sectionName}
        onCancel={onClose}
        onCreate={async (name) => {
          if (await actions.createGroup(name, request.sectionId)) onClose();
        }}
      />
    );
  return (
    <CreatePersonaBotModal
      actions={actions}
      source={request.source}
      {...(request.sectionId === undefined ? {} : { sectionId: request.sectionId })}
      {...(sectionName === undefined ? {} : { sectionName })}
      t={t}
      onCancel={onClose}
      onCreated={onClose}
    />
  );
}

function OwnerEnvironmentCreation({
  request,
  actions,
  t,
  onClose,
  scope,
  sectionName,
}: {
  request: EnvironmentCreateRequest;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose: () => void;
  scope: string;
  sectionName?: string | undefined;
}): ReactElement {
  const state = useRemoteHosts();
  const local = useThisHost();
  const localName = useHostName(local.id, local.name ?? t('environment.create.local'));
  const [busy, setBusy] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [localOwner] = useState(() =>
    localCreationOwner(actions, {
      submitted: () => setSubmitted(true),
      committed: () => setCommitted(true),
    }),
  );
  const continuation = useRef<BridgeActions['openCreatedBot']>(actions.openCreatedBot);
  const localIdentity = useRef<string>();
  const capturedOwner = useRef<
    | {
        id: string;
        client: HostClient;
        owner: ReturnType<typeof remoteCreationOwner>;
      }
    | undefined
  >(undefined);
  const hosts: CreationHost[] = [
    { id: 'local', name: localName, online: true },
    ...state.hosts.map((entry) => ({
      id: entry.host.hostId,
      name: shownHostName(hostLooks().look(entry.host.hostId), entry.host.hostName),
      online: entry.snapshot.connection.status === 'connected',
    })),
  ];
  const [entryScope] = useState(scope);
  const [selected, setSelected] = useState(() =>
    initialCreationHost(entryScope, hosts, lastCreationHost(creationStorage())),
  );
  const selectedId = selected?.id === local.id ? 'local' : selected?.id;
  const target = hosts.find((host) => host.id === selectedId) ?? selected;
  const online = target !== undefined && hosts.some((host) => host.id === target.id && host.online);
  const connectionChanged =
    submitted &&
    capturedOwner.current !== undefined &&
    remoteHosts().client(capturedOwner.current.id) !== capturedOwner.current.client;
  const choices =
    target && !hosts.some((host) => host.id === target.id) ? [...hosts, target] : hosts;
  const targetField = (
    <Field label={t('environment.create.target')}>
      {() => (
        <>
          <Select
            label={t('environment.create.target')}
            value={target?.id ?? ''}
            options={[
              ...(target ? [] : [{ value: '', label: t('environment.create.choose') }]),
              ...choices.map((host) => ({
                value: host.id,
                label: (
                  <>
                    <HostMark hostId={host.id === 'local' ? local.id : host.id} /> {host.name}
                    {host.online ? '' : ` · ${t('environment.offline')}`}
                  </>
                ),
              })),
            ]}
            disabled={entryScope !== 'all' || busy || submitted}
            onChange={(id) => setSelected(choices.find((host) => host.id === id))}
          />
          {connectionChanged ? (
            <span role="status">{t('environment.create.changed')}</span>
          ) : target && !online ? (
            <span role="status">{t('environment.create.offline')}</span>
          ) : null}
        </>
      )}
    </Field>
  );
  const owner = () => {
    if (!target || !online) throw new Error(t('environment.create.offline'));
    if (target.id === 'local') {
      if (!local.id) throw new Error(t('environment.loading'));
      if (localIdentity.current && localIdentity.current !== local.id)
        throw new Error(t('environment.create.changed'));
      localIdentity.current = local.id;
      rememberCreationHost(creationStorage(), { ...target, id: local.id });
      return undefined;
    }
    rememberCreationHost(creationStorage(), target);
    const client = remoteHosts().client(target.id);
    if (!client || client.getSnapshot().connection.status !== 'connected')
      throw new Error(t('environment.create.offline'));
    return { id: target.id, client };
  };
  const remoteOwner = ({ id, client }: { id: string; client: HostClient }) => {
    if (submitted && capturedOwner.current) return capturedOwner.current.owner;
    if (capturedOwner.current?.id !== id || capturedOwner.current.client !== client) {
      capturedOwner.current = {
        id,
        client,
        owner: remoteCreationOwner({
          hostId: id,
          client,
          current: () => remoteHosts().client(id) === client,
          open: (target) => remoteHosts().open(target),
          committed: () => setCommitted(true),
          submitted: () => setSubmitted(true),
        }),
      };
    }
    return capturedOwner.current.owner;
  };
  if (request.kind === 'human-dm') {
    const client =
      target?.id === 'local' || target === undefined ? undefined : remoteHosts().client(target.id);
    const bound =
      target?.id === 'local'
        ? localOwner
        : client && target
          ? remoteOwner({ id: target.id, client })
          : undefined;
    return (
      <MessagePersonDialog
        key={target?.id ?? 'choose'}
        call={bound?.call}
        t={t}
        target={targetField}
        unavailable={
          !online ||
          connectionChanged ||
          bound?.call === undefined ||
          (target?.id === 'local' && !local.id)
        }
        onClose={onClose}
        onOpening={() => {
          owner();
          setSubmitted(true);
        }}
        onOpened={async (channelId, person, signal) => {
          if (client && target) {
            await client.refresh();
            signal.throwIfAborted();
            if (remoteHosts().client(target.id) !== client)
              throw new Error(t('environment.create.changed'));
            remoteHosts().open({ hostId: target.id, channelId, title: person.displayName });
          } else {
            await actions.refreshRoster();
            signal.throwIfAborted();
            remoteHosts().close();
            await actions.openChannel(channelId);
          }
          if (!signal.aborted) onClose();
        }}
      />
    );
  }
  if (request.kind === 'channel')
    return (
      <CreateChannelModal
        t={t}
        target={targetField}
        targetUnavailable={!online || connectionChanged}
        sectionName={sectionName}
        committed={committed}
        submitted={submitted}
        onCancel={onClose}
        onCreate={async (name) => {
          const remote = owner();
          setBusy(true);
          try {
            if (!remote) await localOwner.createGroup(name, request.sectionId);
            else {
              await remoteOwner(remote).channel(name, request.sectionId);
            }
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  return (
    <CreatePersonaBotModal
      actions={{
        ...actions,
        async createBot(input, sectionId) {
          const remote = owner();
          setBusy(true);
          try {
            const bound = bindBotCreationOwner(
              localOwner,
              remote ? remoteOwner(remote) : undefined,
            );
            continuation.current = bound.openCreatedBot;
            return await bound.createBot(input, sectionId);
          } finally {
            setBusy(false);
          }
        },
        openCreatedBot: (bot, sectionId) => continuation.current(bot, sectionId),
      }}
      source={request.source}
      {...(request.sectionId === undefined ? {} : { sectionId: request.sectionId })}
      {...(sectionName === undefined ? {} : { sectionName })}
      t={t}
      target={targetField}
      targetUnavailable={!online || connectionChanged}
      remote={target?.id !== 'local'}
      committed={committed}
      submitted={submitted}
      onCancel={onClose}
      onCreated={onClose}
    />
  );
}
