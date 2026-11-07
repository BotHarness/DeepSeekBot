import {
  Component,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  genuiDocumentIdentity,
  validateGenuiDocumentState,
  type GenuiDocument,
  type GenuiDocumentState,
} from '../../../core/src/channels/genui-document.js';
import {
  buildGenuiHtmlDocument,
  parseGenuiHtmlMessage,
  GENUI_HTML_PROTOCOL,
  GENUI_HTML_RUNTIME_LIMITS,
} from '../../../core/src/channels/genui-html.js';
import { getGenuiDocumentView, type GenuiDocumentActions } from './genui-document-view.js';
import type { BotHarnessTranslate } from './locale.js';
import { ActionButton, ActionGroup } from './ds/action-button.js';
import { color, space, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  document: { display: 'grid', gap: space.x3, minWidth: 0, color: color.fg },
  title: {
    margin: 0,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  meta: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  scroll: { overflow: 'auto', maxHeight: 1000, minWidth: 0 },
  frame: { display: 'block', width: '100%', borderWidth: 0 },
});

interface DocumentProps {
  document: GenuiDocument;
  channelId: string;
  messageId: string;
  actions?: GenuiDocumentActions;
  t: BotHarnessTranslate;
}

export function GenuiDocumentCard(props: DocumentProps): ReactElement {
  const identity = useMemo(() => genuiDocumentIdentity(props.document), [props.document]);
  return (
    <DocumentBoundary
      key={JSON.stringify([props.channelId, props.messageId, identity])}
      fallback={props.t('genui.documentFailed')}
    >
      <DocumentCard {...props} />
    </DocumentBoundary>
  );
}

class DocumentBoundary extends Component<
  { children: ReactNode; fallback: string },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <p role="alert">{this.props.fallback}</p> : this.props.children;
  }
}

function DocumentCard({ document, channelId, messageId, actions, t }: DocumentProps) {
  const controller = useMemo(
    () => getGenuiDocumentView(document, channelId, messageId, actions),
    [document, channelId, messageId, actions],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [reload, setReload] = useState(0);
  const frameKey = `${controller.scopeId}-${reload}`;
  const [frameStatus, setFrameStatus] = useState<{
    key: string;
    status: 'loading' | 'ready' | 'error';
  }>({ key: frameKey, status: 'loading' });
  const renderStatus = frameStatus.key === frameKey ? frameStatus.status : 'loading';
  const setRenderStatus = (status: 'loading' | 'ready' | 'error') =>
    setFrameStatus({ key: frameKey, status });
  const blocked =
    renderStatus !== 'ready' ||
    !snapshot.available ||
    !['ready', 'saving'].includes(snapshot.status);
  const statusKey =
    snapshot.status === 'loading' || snapshot.status === 'resolving'
      ? 'genui.loading'
      : snapshot.status === 'saving'
        ? 'genui.saving'
        : snapshot.status === 'load-error'
          ? 'genui.loadError'
          : snapshot.status === 'save-error'
            ? 'genui.saveError'
            : snapshot.status === 'conflict' || snapshot.status === 'conflict-ready'
              ? 'genui.conflict'
              : 'genui.saved';
  return (
    <section aria-label={document.title} {...stylex.props(styles.document)}>
      <h3 {...stylex.props(styles.title)}>{document.title}</h3>
      <time dateTime={document.observedAt} {...stylex.props(styles.meta)}>
        {document.observedAt}
      </time>
      {document.predecessorMessageId && (
        <span {...stylex.props(styles.meta)}>{t('genui.documentPredecessor')}</span>
      )}
      {snapshot.available && (
        <DocumentFrame
          key={frameKey}
          document={document}
          state={snapshot.state}
          onState={controller.edit}
          onStatus={setRenderStatus}
        />
      )}
      {renderStatus === 'error' && <p role="alert">{t('genui.documentFailed')}</p>}
      {renderStatus === 'loading' && <p role="status">{t('genui.documentLoading')}</p>}
      {!actions && <p {...stylex.props(styles.meta)}>{t('genui.documentReadOnly')}</p>}
      {!document.stateContract && (
        <p {...stylex.props(styles.meta)}>{t('genui.documentNoState')}</p>
      )}
      {!actions && (
        <ActionButton
          icon="refresh"
          onClick={() => {
            setRenderStatus('loading');
            setReload((value) => value + 1);
          }}
        >
          {t('genui.documentReload')}
        </ActionButton>
      )}
      {actions && (
        <>
          {document.stateContract && (
            <p role="status" {...stylex.props(styles.meta)}>
              {t(statusKey)}
            </p>
          )}
          {!snapshot.available && <p role="alert">{t('genui.documentUnavailable')}</p>}
          <ActionGroup>
            {document.stateContract && (
              <>
                <ActionButton icon="refresh" disabled={blocked} onClick={controller.reset}>
                  {t('genui.reset')}
                </ActionButton>
                <ActionButton
                  icon="check"
                  disabled={!['ready', 'save-error', 'conflict-ready'].includes(snapshot.status)}
                  onClick={() => {
                    void controller.save();
                  }}
                >
                  {t('genui.save')}
                </ActionButton>
                <ActionButton
                  icon="refresh"
                  disabled={snapshot.status === 'loading' || snapshot.status === 'saving'}
                  onClick={() => {
                    void controller.reload();
                  }}
                >
                  {t('genui.reload')}
                </ActionButton>
                {snapshot.status === 'conflict' && (
                  <ActionButton
                    icon="check"
                    onClick={() => {
                      void controller.keepDraft();
                    }}
                  >
                    {t('genui.keep')}
                  </ActionButton>
                )}
              </>
            )}
            <ActionButton
              icon="refresh"
              disabled={!snapshot.available}
              onClick={() => {
                setRenderStatus('loading');
                setReload((value) => value + 1);
              }}
            >
              {t('genui.documentReload')}
            </ActionButton>
          </ActionGroup>
          <ActionGroup>
            <ActionButton
              icon="message-square"
              tone="primary"
              disabled={blocked}
              busy={snapshot.sendStatus === 'sending'}
              onClick={() => {
                void controller.send(
                  'continue',
                  t('genui.documentContinueBody', { title: document.title }),
                );
              }}
            >
              {t('genui.documentContinue')}
            </ActionButton>
            <ActionButton
              icon="refresh"
              disabled={blocked}
              busy={snapshot.sendStatus === 'sending'}
              onClick={() => {
                void controller.send(
                  'refresh',
                  t('genui.documentRefreshBody', { title: document.title }),
                );
              }}
            >
              {t('genui.documentRefresh')}
            </ActionButton>
          </ActionGroup>
          {snapshot.sendStatus === 'error' && <p role="alert">{t('genui.sendError')}</p>}
          {snapshot.sendStatus === 'sent' && <p role="status">{t('genui.sent')}</p>}
        </>
      )}
    </section>
  );
}

interface FrameProps {
  document: GenuiDocument;
  state: GenuiDocumentState;
  onState: (state: GenuiDocumentState) => void;
  onStatus: (status: 'loading' | 'ready' | 'error') => void;
}

export class DocumentFrame extends Component<FrameProps, { height: number; failed: boolean }> {
  override state: { height: number; failed: boolean } = {
    height: GENUI_HTML_RUNTIME_LIMITS.minHeight,
    failed: false,
  };
  private readonly instanceId = crypto.randomUUID();
  private readonly compiled = buildGenuiHtmlDocument(this.props.document, {
    instanceId: this.instanceId,
    theme: this.theme(),
    state: this.props.state,
  });
  private frame: HTMLIFrameElement | null = null;
  private owner: Window | null = null;
  private observer?: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private ready = false;
  private disposed = false;
  private stateIdentity = JSON.stringify(this.props.state);

  private theme() {
    return globalThis.document?.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
  }

  override componentDidMount() {
    this.disposed = false;
    if (!this.frame || !('srcdoc' in this.frame) || typeof MutationObserver === 'undefined') {
      this.fail();
      return;
    }
    this.owner = this.frame?.ownerDocument.defaultView ?? null;
    this.owner?.addEventListener('message', this.message);
    this.observer = new MutationObserver(() => this.post({ type: 'theme', theme: this.theme() }));
    this.observer.observe(this.frame?.ownerDocument.body ?? document.body, {
      attributes: true,
      attributeFilter: ['data-ds-dark-theme'],
    });
    this.timer = setTimeout(this.fail, GENUI_HTML_RUNTIME_LIMITS.startupMs);
  }

  override componentDidUpdate() {
    const identity = JSON.stringify(this.props.state);
    if (identity !== this.stateIdentity) {
      this.stateIdentity = identity;
      if (this.ready) this.post({ type: 'restore', state: this.props.state });
    }
  }

  override componentWillUnmount() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.observer?.disconnect();
    this.owner?.removeEventListener('message', this.message);
  }

  private post(
    message:
      | { type: 'restore'; state: GenuiDocumentState }
      | { type: 'theme'; theme: 'light' | 'dark' },
  ) {
    this.frame?.contentWindow?.postMessage(
      { protocol: GENUI_HTML_PROTOCOL, instanceId: this.instanceId, ...message },
      '*',
    );
  }

  private fail = () => {
    if (this.disposed || this.state.failed) return;
    clearTimeout(this.timer);
    this.observer?.disconnect();
    this.owner?.removeEventListener('message', this.message);
    this.props.onStatus('error');
    this.setState({ failed: true });
  };

  private sequence = 0;

  private message = (event: MessageEvent) => {
    if (
      this.disposed ||
      this.state.failed ||
      !this.frame ||
      event.source !== this.frame.contentWindow ||
      event.origin !== 'null'
    )
      return;
    const message = parseGenuiHtmlMessage(event.data, this.instanceId);
    if (!message || message.sequence <= this.sequence) return;
    this.sequence = message.sequence;
    if (message.type === 'error') {
      this.fail();
      return;
    }
    if (message.type === 'ready') {
      if (this.ready) return;
      this.ready = true;
      this.post({ type: 'restore', state: this.props.state });
      this.post({ type: 'theme', theme: this.theme() });
      this.props.onStatus('ready');
    }
    if (message.type === 'ready' || (message.type === 'heartbeat' && this.ready)) {
      clearTimeout(this.timer);
      this.timer = setTimeout(this.fail, GENUI_HTML_RUNTIME_LIMITS.heartbeatTimeoutMs);
    }
    if (!this.ready) return;
    if (message.type === 'height' && message.height !== this.state.height)
      this.setState({ height: message.height });
    if (message.type === 'state' && this.props.document.stateContract) {
      try {
        const state = validateGenuiDocumentState(this.props.document, message.state);
        const identity = JSON.stringify(state);
        if (identity === this.stateIdentity) return;
        this.stateIdentity = identity;
        this.props.onState(state);
      } catch {
        this.fail();
      }
    }
  };

  override render() {
    if (this.state.failed) return null;
    return (
      <div
        role="region"
        aria-label={this.props.document.title}
        tabIndex={0}
        {...stylex.props(styles.scroll)}
      >
        <iframe
          ref={(frame) => {
            this.frame = frame;
          }}
          title={this.props.document.title}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={this.compiled.html}
          data-document-id={this.compiled.documentId}
          data-policy-version={this.compiled.policyVersion}
          onError={this.fail}
          {...stylex.props(styles.frame)}
          style={{ height: this.state.height }}
        />
      </div>
    );
  }
}
