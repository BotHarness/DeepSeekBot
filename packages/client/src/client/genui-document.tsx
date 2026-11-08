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
import { GENUI_EXECUTION_LIMITS } from '../../../core/src/channels/genui-execution-limits.js';
import type { GenuiDocumentHandle } from '../../../core/src/channels/genui-document-runtime.js';
import { loadGenuiDocumentRuntime } from './genui-document-runtime.js';
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

export class DocumentFrame extends Component<FrameProps, { failed: boolean }> {
  override state = { failed: false };
  private readonly instanceId = crypto.randomUUID();
  private container: HTMLDivElement | null = null;
  private surface: GenuiDocumentHandle | undefined;
  private observer?: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private failed = false;
  private generation = 0;
  private stateIdentity = JSON.stringify(this.props.state);

  private theme() {
    return this.container?.ownerDocument.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
  }

  private textScale() {
    const body = this.container?.ownerDocument.body;
    const owner = body?.ownerDocument.defaultView;
    const size = Number.parseFloat(
      body && owner ? owner.getComputedStyle(body).getPropertyValue('--dsh-content-font-size') : '',
    );
    return Number.isFinite(size) && size > 0 ? size / GENUI_EXECUTION_LIMITS.mirrorBaseFontSize : 1;
  }

  override componentDidMount() {
    this.disposed = false;
    const generation = ++this.generation;
    const container = this.container;
    const owner = container?.ownerDocument.defaultView;
    if (!container || !owner || typeof owner.MutationObserver !== 'function') {
      this.fail();
      return;
    }
    this.observer = new owner.MutationObserver((records) => {
      if (records.some((record) => record.attributeName === 'data-ds-dark-theme'))
        this.surface?.theme(this.theme());
      if (records.some((record) => record.attributeName === 'style'))
        this.surface?.textScale(this.textScale());
    });
    this.observer.observe(container.ownerDocument.body, {
      attributes: true,
      attributeFilter: ['data-ds-dark-theme', 'style'],
    });
    this.timer = setTimeout(this.fail, GENUI_EXECUTION_LIMITS.startupMs);
    void loadGenuiDocumentRuntime()
      .then(
        (runtime) => {
          if (!this.active(generation)) return;
          clearTimeout(this.timer);
          const surface = runtime.mountGenuiDocument(container, {
            document: this.props.document,
            state: this.props.state,
            theme: this.theme(),
            textScale: this.textScale(),
            instanceId: this.instanceId,
            generation,
            onState: (value) => {
              if (!this.active(generation) || !this.props.document.stateContract) return;
              try {
                const state = validateGenuiDocumentState(this.props.document, value);
                const identity = JSON.stringify(state);
                if (identity === this.stateIdentity) return;
                this.stateIdentity = identity;
                this.props.onState(state);
              } catch {
                this.fail();
              }
            },
            onHeight: () => {},
            onFailure: () => {
              if (this.active(generation)) this.fail();
            },
          });
          void surface.ready.then(
            () => {
              if (this.active(generation)) this.props.onStatus('ready');
            },
            () => {
              if (this.active(generation)) this.fail();
            },
          );
          if (!this.active(generation)) {
            surface.dispose();
            return;
          }
          this.surface = surface;
        },
        () => {
          if (this.active(generation)) this.fail();
        },
      )
      .catch(() => {
        if (this.active(generation)) this.fail();
      });
  }

  override componentDidUpdate() {
    const identity = JSON.stringify(this.props.state);
    if (identity !== this.stateIdentity) {
      this.stateIdentity = identity;
      this.surface?.restore(this.props.state);
    }
  }

  override componentWillUnmount() {
    this.disposed = true;
    this.generation++;
    clearTimeout(this.timer);
    this.observer?.disconnect();
    this.surface?.dispose();
    this.surface = undefined;
  }

  private active(generation: number): boolean {
    return !this.disposed && !this.failed && generation === this.generation;
  }

  private fail = () => {
    if (this.disposed || this.failed) return;
    this.failed = true;
    clearTimeout(this.timer);
    this.observer?.disconnect();
    this.surface?.dispose();
    this.surface = undefined;
    this.props.onStatus('error');
    this.setState({ failed: true });
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
        <div
          ref={(container) => {
            this.container = container;
          }}
        />
      </div>
    );
  }
}
