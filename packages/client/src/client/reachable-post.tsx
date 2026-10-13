import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MessagingIdentityView } from '../../../core/src/messaging/identity.js';
import type { MessagingReachablePage } from '../../../core/src/messaging/provider.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { Combobox } from './combobox.js';
import { useMountedResource } from './mounted-resource.js';
import { reachablePostRequests } from './reachable-post-requests.js';

export function ReachablePostDialog({
  slug,
  identity,
  recoveryScope,
  actions,
  t,
  onClose,
  refresh,
}: {
  slug: string;
  identity: MessagingIdentityView;
  recoveryScope: string | undefined;
  actions: Pick<
    BridgeActions,
    | 'messagingReachable'
    | 'messagingPostConversation'
    | 'messagingPostLimit'
    | 'messagingPostRequest'
  >;
  t: BotHarnessTranslate;
  onClose(): void;
  refresh(): Promise<void>;
}): ReactElement {
  const requests = reachablePostRequests(
    recoveryScope === undefined
      ? undefined
      : JSON.stringify([recoveryScope, slug, identity.id, identity.fingerprint]),
  );
  const [groups, setGroups] = useState<MessagingReachablePage['conversations']>([]);
  const [cursor, setCursor] = useState<string>();
  const [group, setGroup] = useState(requests.last?.group ?? '');
  const [text, setText] = useState(requests.last?.text ?? '');
  const [limit, setLimit] = useState(
    identity.postLimit === null ? '' : String(identity.postLimit ?? 60),
  );
  const [revision, setRevision] = useState(identity.postLimitRevision ?? identity.revision);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [legacy, setLegacy] = useState(false);
  const live = useRef(false);
  const request = useSyncExternalStore(requests.subscribe, () => requests.read(group, text));
  const selected = useRef({ group, text });
  selected.current = { group, text };
  const load = async (next?: string) => {
    setLoading(true);
    setError('');
    try {
      if (!actions.messagingReachable) {
        setLegacy(true);
        return;
      }
      const page = await actions.messagingReachable(slug, identity.id, next);
      if (!live.current) return;
      setGroups((prior) =>
        [...(next ? prior : []), ...page.conversations].filter(
          (value, index, all) => all.findIndex((other) => other.id === value.id) === index,
        ),
      );
      setCursor(page.hasMore ? page.cursor : undefined);
    } catch (failure) {
      if (!live.current) return;
      const code =
        failure && typeof failure === 'object' && 'code' in failure ? failure.code : undefined;
      if (code === 'capability-unavailable') setLegacy(true);
      else setError(t('proactive.loadError'));
    } finally {
      if (live.current) setLoading(false);
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    live.current = true;
    void load();
    let reading = false;
    const reconcile = async () => {
      const draft = requests.read(selected.current.group, selected.current.text);
      if (
        requests.failed ||
        reading ||
        !actions.messagingPostRequest ||
        !draft ||
        !['pending', 'in-flight', 'response-lost'].includes(draft.state)
      )
        return;
      reading = true;
      try {
        const intent = await actions.messagingPostRequest(
          slug,
          identity.id,
          draft.group,
          draft.id,
          draft.text,
        );
        if (
          intent?.botSlug === slug &&
          intent.text === draft.text &&
          intent.report?.conversationId === draft.group
        )
          requests.finish(draft, intent.state, intent.reason);
      } catch {
        return;
      } finally {
        reading = false;
      }
    };
    void reconcile();
    const timer = setInterval(() => void reconcile(), 2_000);
    return () => {
      live.current = false;
      clearInterval(timer);
    };
  }, [identity.id, requests]);
  const unknown = request?.state === 'unknown-outcome';
  const pending = request?.state === 'pending' || request?.state === 'in-flight';
  const send = async () => {
    if (
      busy ||
      loading ||
      unknown ||
      pending ||
      requests.failed ||
      !group ||
      !text.trim() ||
      !actions.messagingPostConversation
    )
      return;
    setBusy(true);
    setError('');
    let current: ReturnType<typeof requests.begin> | undefined;
    let received = false;
    const recovering = request?.state === 'response-lost';
    try {
      current = requests.begin(group, text);
      const intent = await actions.messagingPostConversation(
        slug,
        identity.id,
        group,
        current.id,
        text,
      );
      received = true;
      requests.finish(current, intent.state, intent.reason);
    } catch (failure) {
      const refused =
        failure &&
        typeof failure === 'object' &&
        'code' in failure &&
        failure.code === 'grant-revoked';
      if (current)
        requests.finish(current, refused && !recovering ? 'grant-revoked' : 'response-lost');
      if (live.current)
        setError(
          t(
            refused && !recovering
              ? 'proactive.sendRefused'
              : requests.failed
                ? 'proactive.recoveryError'
                : 'proactive.sendError',
          ),
        );
    }
    if (live.current) {
      if (received) {
        try {
          await refresh();
        } catch {
          setError(t('proactive.refreshError'));
        }
      }
      setBusy(false);
    }
  };
  const saveLimit = async () => {
    const value = limit.trim() === '' ? null : Number(limit);
    if (
      !actions.messagingPostLimit ||
      busy ||
      (value !== null && (!Number.isInteger(value) || value < 1 || value > 10000))
    )
      return;
    setBusy(true);
    setError('');
    try {
      await actions.messagingPostLimit(slug, identity.id, revision, value);
      if (!live.current) return;
      setRevision((prior) => prior + 1);
      await refresh();
    } catch {
      if (live.current) setError(t('proactive.limitError'));
    } finally {
      if (live.current) setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('proactive.title')}
      closeLabel={t('common.close')}
      className="bh-sidebar-modal"
      contentClassName="bh-im-fields"
      footer={
        <div className="bh-modal-footer">
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            variant="primary"
            disabled={
              busy ||
              loading ||
              legacy ||
              unknown ||
              pending ||
              requests.failed ||
              !group ||
              !text.trim()
            }
            onClick={() => void send()}
          >
            {t('proactive.send')}
          </Button>
        </div>
      }
    >
      <div ref={mount} className="bh-im-fields">
        <p className="bh-sidebar-modal-subject">{identity.name}</p>
        <p className="bh-note">{t('proactive.description')}</p>
        {legacy ? (
          <p role="status">{t('proactive.legacy')}</p>
        ) : (
          <>
            <div className="bh-im-field">
              <label>{t('proactive.group')}</label>
              <Combobox
                value={group}
                onSelect={(value) => {
                  setGroup(value);
                }}
                label={t('proactive.group')}
                toggleLabel={t('proactive.group')}
                placeholder={t('proactive.chooseGroup')}
                emptyLabel={t('proactive.empty')}
                disabled={loading || busy}
                options={groups.map((value) => ({ value: value.id, label: value.name }))}
              />
            </div>
            {loading ? <p role="status">{t('im.loading')}</p> : null}
            {cursor ? (
              <Button
                variant="outline"
                disabled={busy || loading}
                onClick={() => void load(cursor)}
              >
                {t('proactive.more')}
              </Button>
            ) : null}
            <div className="bh-im-field">
              <label htmlFor="bh-proactive-text">{t('proactive.message')}</label>
              <textarea
                id="bh-proactive-text"
                className="bh-im-textarea"
                value={text}
                maxLength={4000}
                disabled={busy}
                onChange={(event) => {
                  setText(event.currentTarget.value);
                }}
              />
            </div>
          </>
        )}
        <div className="bh-im-field">
          <label>{t('proactive.limit')}</label>
          <Input
            aria-label={t('proactive.limit')}
            value={limit}
            onChange={(event) => setLimit(event.currentTarget.value)}
            disabled={busy}
          />
          <p className="bh-note">{t('proactive.limitHint')}</p>
          <Button variant="outline" disabled={busy} onClick={() => void saveLimit()}>
            {t('proactive.saveLimit')}
          </Button>
        </div>
        {error || requests.failed ? (
          <p role="alert" className="bh-error">
            {error || t('proactive.recoveryError')}
          </p>
        ) : null}
        {request ? (
          <p role="status">
            {t(
              pending
                ? 'proactive.pending'
                : request.state === 'response-lost'
                  ? 'proactive.sendError'
                  : request.state === 'unknown-outcome'
                    ? 'proactive.unknown'
                    : request.state === 'provider-accepted'
                      ? 'proactive.accepted'
                      : request.reason === 'post-rate-limited'
                        ? 'proactive.rateLimited'
                        : request.state === 'grant-revoked'
                          ? 'proactive.sendRefused'
                          : 'proactive.failed',
            )}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
