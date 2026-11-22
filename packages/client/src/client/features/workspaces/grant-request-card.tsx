import { useRef, useState, type ReactElement } from 'react';
import type { BridgeActions } from '../../actions.js';
import { errorMessage } from '../../bridge.js';
import { ActionButton } from '../../ds/action-button.js';
import type { BotHarnessTranslate } from '../../locale.js';
import { useMountedResource } from '../../mounted-resource.js';
import type { ChannelMessage } from '../../store.js';
import {
  FolderBrowser,
  folderBrowseError,
  type FolderBrowserActions,
} from '../../workspace-grants-entry.js';

export function GrantRequestCard({
  message,
  actions,
  resolved,
  workspacePickerRequest,
  compact = false,
  beforeOpen,
  channelId,
  t,
}: {
  message: ChannelMessage;
  actions: Pick<BridgeActions, 'pickWorkspaceFolder' | 'resolveWorkspaceGrantRequest'> &
    FolderBrowserActions;
  channelId?: string | undefined;
  workspacePickerRequest?: number | undefined;
  resolved: boolean;
  compact?: boolean;
  beforeOpen?: () => Promise<boolean>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [listing, setListing] =
    useState<Awaited<ReturnType<FolderBrowserActions['listHostFolders']>>>();
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const open = (alreadyChecked = false): void => {
    if (botSlug === undefined || busy || opening || resolved || completed) return;
    setOpening(true);
    setError(undefined);
    void (async () => {
      if (!alreadyChecked && beforeOpen !== undefined && !(await beforeOpen())) return;
      const pickNatively = async (): Promise<void> => {
        const path = await actions.pickWorkspaceFolder();
        if (path !== null) approve(path);
      };
      return actions.listHostFolders().then(
        (value) => (value.nativePicker === true ? pickNatively() : setListing(value)),
        async (cause: unknown) => {
          if (
            cause instanceof Error &&
            'rpcError' in cause &&
            typeof cause.rpcError === 'object' &&
            cause.rpcError !== null &&
            'code' in cause.rpcError &&
            cause.rpcError.code === 'directory-picker/unavailable'
          )
            return pickNatively();
          setError(folderBrowseError(cause, t));
        },
      );
    })()
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setOpening(false));
  };
  const approve = (path: string): void => {
    if (botSlug === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    void (async () => {
      try {
        await actions.resolveWorkspaceGrantRequest(
          botSlug,
          message.id,
          path,
          (name) => t('grant.requestApprovedMessage', { name }),
          channelId,
        );
        setCompleted(true);
        setListing(undefined);
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(false);
      }
    })();
  };
  const openedRequest = useRef<number>();
  const pickerTrigger = useMountedResource<HTMLDivElement>(() => {
    if (
      workspacePickerRequest !== undefined &&
      workspacePickerRequest !== openedRequest.current &&
      !resolved &&
      !completed
    ) {
      openedRequest.current = workspacePickerRequest;
      open(true);
    }
  }, [workspacePickerRequest]);
  const chooseButton = (
    <ActionButton
      icon="folder-key"
      tone="primary"
      size={compact ? 'sm' : 'md'}
      busy={opening}
      disabled={busy || opening}
      onClick={() => open()}
    >
      {t(compact ? 'activityList.grant.handle' : 'grant.requestChoose')}
    </ActionButton>
  );
  return (
    <div
      className={compact ? 'bh-activity-list-grant-action' : 'bh-grant-request-card'}
      ref={pickerTrigger}
    >
      {compact ? null : (
        <>
          <div className="bh-grant-request-title">{t('grant.requestTitle')}</div>
          <div className="bh-grant-request-reason">{message.body}</div>
        </>
      )}
      {resolved || completed ? (
        <div className="bh-note" role="status">
          {t('grant.requestResolved')}
        </div>
      ) : compact ? (
        chooseButton
      ) : (
        <div className="bh-message-card-actions">{chooseButton}</div>
      )}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {listing === undefined ? null : (
        <FolderBrowser
          initial={listing}
          actions={actions}
          onCancel={() => setListing(undefined)}
          onChoose={approve}
          busy={busy}
          t={t}
        />
      )}
    </div>
  );
}
