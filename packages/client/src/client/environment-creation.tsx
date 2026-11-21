import { useMemo, useRef, useState, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import { Field } from './ds/field.js';
import { Select } from './ds/select.js';
import { useRemoteHosts, HostMark } from './host-tabs.js';
import { remoteHosts } from './remote-hosts.js';
import { memberPage } from './member-page.js';
import { useThisHost } from './this-host.js';
import { hostLooks, useHostName } from './host-looks.js';
import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import type { HostClient } from '@botharness/host-client/client';
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
  const { request, actions, t, onClose, sectionName, onBack } = props;
  if (!memberPage()) return <OwnerEnvironmentCreation {...props} />;
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
      <MemberChannelCreation
        actions={actions}
        sectionId={request.sectionId}
        sectionName={sectionName}
        t={t}
        onClose={onClose}
      />
    );
  return (
    <CreatePersonaBotModal
      onBack={onBack}
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

function MemberChannelCreation({
  actions,
  sectionId,
  sectionName,
  t,
  onClose,
}: {
  actions: BridgeActions;
  sectionId: string | undefined;
  sectionName: string | undefined;
  t: BotHarnessTranslate;
  onClose: () => void;
}): ReactElement {
  const teamCall = actions.teamCall;
  const memberCall = useMemo(
    () => (teamCall?.bindConnection ? teamCall.bindConnection() : teamCall),
    [teamCall],
  );
  return (
    <CreateChannelModal
      t={t}
      sectionName={sectionName}
      members={memberCall && { scope: 'member-host', call: memberCall }}
      targetUnavailable={!memberCall}
      onCancel={onClose}
      onCreate={async (name, key, onDispatch) => {
        if (!memberCall) throw new Error(t('environment.create.offline'));
        memberCall.assertCurrent?.();
        onDispatch();
        return actions.createGroup({ name, sectionId, operationKey: key, scopedCall: memberCall });
      }}
      onMembersChanged={(channel) => {
        if (memberCall)
          void actions.openChannel(channel.id, { scopedCall: memberCall }).catch(() => undefined);
      }}
    />
  );
}

function OwnerEnvironmentCreation({
  request,
  actions,
  t,
  onClose,
  scope,
  onBack,
  sectionName,
}: {
  request: EnvironmentCreateRequest;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose: () => void;
  scope: string;
  onBack?: (() => void) | undefined;
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
  const teamCall = actions.teamCall;
  const localReady = request.kind === 'channel' && target?.id === 'local' && local.id !== undefined;
  const localGroupCall = useMemo(
    () =>
      localReady ? (teamCall?.bindConnection ? teamCall.bindConnection() : teamCall) : undefined,
    [localReady, local.id, teamCall],
  );
  const connectionChanged =
    submitted &&
    capturedOwner.current !== undefined &&
    target?.id === capturedOwner.current.id &&
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
  if (request.kind === 'channel') {
    const client =
      target === undefined || target.id === 'local' ? undefined : remoteHosts().client(target.id);
    const pickerCall =
      target?.id === 'local'
        ? localGroupCall
        : target && client
          ? remoteOwner({ id: target.id, client }).call
          : undefined;
    return (
      <CreateChannelModal
        t={t}
        target={targetField}
        members={
          pickerCall &&
          target && {
            scope: target.id === 'local' ? (local.id ?? 'local') : target.id,
            call: pickerCall,
          }
        }
        targetUnavailable={!online || connectionChanged || !pickerCall}
        sectionName={sectionName}
        committed={committed}
        submitted={submitted}
        onCancel={onClose}
        onCreate={async (name, operationKey, onDispatch) => {
          const remote = owner();
          if (!pickerCall) throw new Error(t('environment.create.offline'));
          pickerCall.assertCurrent?.();
          setBusy(true);
          try {
            onDispatch();
            if (!remote)
              return await localOwner.createGroup(name, request.sectionId, {
                call: pickerCall,
                operationKey,
              });
            return await remoteOwner(remote).channel(name, request.sectionId, operationKey);
          } finally {
            setBusy(false);
          }
        }}
        onMembersChanged={(channel) => {
          if (client) void client.refresh().catch(() => undefined);
          else
            void actions.openChannel(channel.id, { scopedCall: pickerCall }).catch(() => undefined);
        }}
      />
    );
  }
  return (
    <CreatePersonaBotModal
      onBack={onBack}
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
