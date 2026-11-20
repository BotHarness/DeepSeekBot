import { MessageBotDialog } from './message-bot-dialog.js';
import { BotCreateSourceModal } from './bot-create-source.js';
import { EnvironmentCreation } from './environment-creation.js';
import { EnvironmentSections } from './environment-sections.js';
import { useThisHost } from './this-host.js';
import { useHostName } from './host-looks.js';
import type { ReactElement, Dispatch, SetStateAction, RefCallback } from 'react';
import type { BotModeSortMode } from '@botharness/host-client/shared/bot-mode-settings';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { ImportBotZipModal } from './bot-zip.js';
import { MarketplaceModal } from './marketplace.js';
import type { RosterSection } from './roster.js';
import { CreateSectionModal } from './section-management.js';
import type { RemoteHostsSnapshot } from './remote-hosts.js';
import type { SidebarState, CreateRequest, BatchError } from './bot-sidebar-types.js';

function LocalEnvironmentName(): ReactElement {
  const host = useThisHost();
  const name = useHostName(host.id, host.name ?? '');
  return <span className="bh-muted-mark">{name}</span>;
}
function LocalCreationTarget({ t }: { t: BotHarnessTranslate }): ReactElement {
  return (
    <span>
      {t('environment.create.target')} · <LocalEnvironmentName />
    </span>
  );
}

export function botCreateSource(id: string): 'empty' | 'git' | 'zip' | undefined {
  if (id === 'bot:empty') return 'empty';
  if (id === 'bot:git') return 'git';
  if (id === 'bot:zip') return 'zip';
  return undefined;
}

export function sidebarCreationMenu({
  setMenuOpen,
  setCreateRequest,
  remoteHostsState,
  member,
  hostTabs,
  setRemoteSectionsHost,
}: {
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  setCreateRequest: Dispatch<SetStateAction<CreateRequest | undefined>>;
  remoteHostsState: RemoteHostsSnapshot;
  member: boolean;
  hostTabs: boolean;
  setRemoteSectionsHost: Dispatch<SetStateAction<{ id: string; name: string } | undefined>>;
}) {
  return (id: string): void => {
    setMenuOpen(false);
    if (id === 'bot') setCreateRequest({ kind: 'bot-source' });
    const source = botCreateSource(id);
    if (source !== undefined) setCreateRequest({ kind: 'bot', source });
    if (id === 'channel') setCreateRequest({ kind: 'channel' });
    if (id === 'section') {
      const remote = remoteHostsState.hosts.find(
        (entry) => entry.host.hostId === remoteHostsState.tab,
      );
      if (member) setCreateRequest({ kind: 'section' });
      else if (hostTabs && remote)
        setRemoteSectionsHost({
          id: remote.host.hostId,
          name: remote.host.hostName,
        });
      else if (!hostTabs || remoteHostsState.tab === 'local') setCreateRequest({ kind: 'section' });
    }
    if (id === 'marketplace') setCreateRequest({ kind: 'marketplace' });
    if (id === 'message-person') setCreateRequest({ kind: 'message-person' });
    if (id === 'message-bot') setCreateRequest({ kind: 'message-bot' });
  };
}

export function sidebarCreationSection({
  createRequest,
  state,
}: {
  createRequest: CreateRequest | undefined;
  state: SidebarState;
}) {
  const createSectionId =
    createRequest?.kind === 'channel' ||
    createRequest?.kind === 'bot' ||
    createRequest?.kind === 'bot-source'
      ? createRequest.sectionId
      : undefined;
  const createSection =
    createSectionId === undefined
      ? undefined
      : state.roster.sections.find((section) => section.id === createSectionId);
  return { createSectionId, createSection };
}

export function renderEnvironmentCreationDialogs({
  createRequest,
  t,
  member,
  hostTabs,
  remoteHostsState,
  setCreateRequest,
  createFromWelcome,
  actions,
  createSection,
  remoteSectionsHost,
  setRemoteSectionsHost,
}: {
  createRequest: CreateRequest | undefined;
  t: BotHarnessTranslate;
  member: boolean;
  hostTabs: boolean;
  remoteHostsState: RemoteHostsSnapshot;
  setCreateRequest: Dispatch<SetStateAction<CreateRequest | undefined>>;
  createFromWelcome: RefCallback<HTMLSpanElement>;
  actions: BridgeActions;
  createSection: RosterSection | undefined;
  remoteSectionsHost: { id: string; name: string } | undefined;
  setRemoteSectionsHost: Dispatch<SetStateAction<{ id: string; name: string } | undefined>>;
}): ReactElement {
  return (
    <>
      {createRequest?.kind === 'bot-source' ? (
        <BotCreateSourceModal
          t={t}
          member={member}
          localImports={!hostTabs || remoteHostsState.tab === 'local'}
          onClose={() => setCreateRequest(undefined)}
          onSelect={(source) =>
            setCreateRequest({
              kind: 'bot',
              source,
              ...(createRequest.sectionId ? { sectionId: createRequest.sectionId } : {}),
            })
          }
        />
      ) : null}
      <span ref={createFromWelcome} hidden aria-hidden="true" />
      {createRequest?.kind === 'channel' ||
      createRequest?.kind === 'message-person' ||
      (createRequest?.kind === 'bot' && createRequest.source !== 'zip') ? (
        <EnvironmentCreation
          request={
            createRequest.kind === 'message-person'
              ? { kind: 'human-dm' }
              : createRequest.kind === 'channel'
                ? createRequest
                : {
                    kind: 'bot',
                    source: createRequest.source === 'git' ? 'git' : 'empty',
                    ...(createRequest.sectionId === undefined
                      ? {}
                      : { sectionId: createRequest.sectionId }),
                  }
          }
          onBack={
            createRequest.kind === 'bot'
              ? () =>
                  setCreateRequest({
                    kind: 'bot-source',
                    ...(createRequest.sectionId ? { sectionId: createRequest.sectionId } : {}),
                  })
              : undefined
          }
          actions={actions}
          t={t}
          scope={hostTabs ? remoteHostsState.tab : 'local'}
          sectionName={createSection?.name}
          onClose={() => setCreateRequest(undefined)}
        />
      ) : null}
      {remoteSectionsHost ? (
        <EnvironmentSections
          host={remoteSectionsHost}
          t={t}
          onClose={() => setRemoteSectionsHost(undefined)}
        />
      ) : null}
    </>
  );
}

export function renderLocalCreationDialogs({
  createRequest,
  setCreateRequest,
  t,
  actions,
  createSectionId,
  createSection,
  commitBulkMove,
  setSectionSortMode,
  setBatchError,
  openLocalConversation,
}: {
  createRequest: CreateRequest | undefined;
  setCreateRequest: Dispatch<SetStateAction<CreateRequest | undefined>>;
  t: BotHarnessTranslate;
  actions: BridgeActions;
  createSectionId: string | undefined;
  createSection: RosterSection | undefined;
  commitBulkMove: (ids: readonly string[], targetSectionId: string | undefined) => Promise<void>;
  setSectionSortMode: (sectionId: string, mode: BotModeSortMode | undefined) => void;
  setBatchError: Dispatch<SetStateAction<BatchError | undefined>>;
  openLocalConversation: () => void;
}) {
  return {
    importZip:
      createRequest?.kind === 'bot' && createRequest.source === 'zip' ? (
        <ImportBotZipModal
          onBack={() =>
            setCreateRequest({
              kind: 'bot-source',
              ...(createRequest.sectionId ? { sectionId: createRequest.sectionId } : {}),
            })
          }
          target={<LocalCreationTarget t={t} />}
          t={t}
          actions={actions}
          {...(createSectionId === undefined ? {} : { sectionId: createSectionId })}
          {...(createSection === undefined ? {} : { sectionName: createSection.name })}
          onCancel={() => {
            setCreateRequest(undefined);
          }}
          onImported={() => {
            setCreateRequest(undefined);
          }}
        />
      ) : null,
    marketplace:
      createRequest?.kind === 'marketplace' ? (
        <MarketplaceModal
          target={<LocalCreationTarget t={t} />}
          t={t}
          actions={actions}
          onClose={() => {
            setCreateRequest(undefined);
          }}
          onInstalled={() => {
            setCreateRequest(undefined);
          }}
        />
      ) : null,
    createSectionDialog:
      createRequest?.kind === 'section' ? (
        <CreateSectionModal
          t={t}
          onCancel={() => {
            setCreateRequest(undefined);
          }}
          onCreate={async (name) => {
            const request = createRequest;
            const section = await actions.createSection(name);
            if (section === undefined) return false;
            setCreateRequest(undefined);
            try {
              if (request.moveChannelIds !== undefined) {
                await commitBulkMove(request.moveChannelIds, section.id);
              } else if (request.moveChannelId !== undefined) {
                if (request.pinned === true) {
                  if (
                    await actions.movePinnedChannel(request.moveChannelId, section.id, [
                      request.moveChannelId,
                    ])
                  )
                    setSectionSortMode(section.id, 'manual');
                  else setBatchError('failed');
                } else await commitBulkMove([request.moveChannelId], section.id);
              }
            } catch {
              setBatchError('failed');
            }
            return true;
          }}
        />
      ) : null,
    messageBot:
      createRequest?.kind === 'message-bot' && actions.teamCall !== undefined ? (
        <MessageBotDialog
          call={actions.teamCall}
          t={t}
          onClose={() => setCreateRequest(undefined)}
          onOpen={(bot) => {
            setCreateRequest(undefined);
            openLocalConversation();
            void actions.refreshRoster().then(() => actions.openBot(bot.slug));
          }}
        />
      ) : null,
  };
}
