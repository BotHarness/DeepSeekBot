import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { IconInfoOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import { errorMessage } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { useMountedResource } from './mounted-resource.js';
import { Tooltip } from './ds/tooltip.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';

export type BotPromptView = 'system-prompt' | 'turn-input';

type SystemPromptValue = Awaited<ReturnType<BridgeActions['botSystemPrompt']>>;
type TurnInputValue = Awaited<ReturnType<BridgeActions['botTurnInput']>>;

const styles = stylex.create({
  heading: { display: 'flex', alignItems: 'center', gap: space.x2, margin: 0 },
  title: { margin: 0, fontSize: text.titleSize, lineHeight: text.titleLine },
  info: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: 0,
    border: 'none',
    background: 'none',
    color: color.muted,
    cursor: 'pointer',
  },
  explain: {
    margin: 0,
    padding: space.x3,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    whiteSpace: 'pre-wrap',
  },
  meta: { margin: 0, color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  block: {
    margin: 0,
    padding: space.x3,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.divider,
    borderRadius: radius.sm,
    fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  summary: { cursor: 'pointer', fontSize: text.bodySize, lineHeight: text.bodyLine },
});

function Explained({
  title,
  info,
  t,
  tag,
}: {
  title: string;
  info: string;
  t: BotHarnessTranslate;
  tag?: string | undefined;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div {...stylex.props(styles.heading)}>
        <h3 {...stylex.props(styles.title)}>{title}</h3>
        {tag === undefined ? null : <Tag tone="warning">{tag}</Tag>}
        <Tooltip label={info} side="bottom">
          <button
            type="button"
            {...stylex.props(styles.info)}
            aria-label={t('promptInspect.howItWorks')}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <IconInfoOutlineRegular size={14} />
          </button>
        </Tooltip>
      </div>
      {open ? <p {...stylex.props(styles.explain)}>{info}</p> : null}
    </>
  );
}

function SystemPromptBody({
  value,
  t,
}: {
  value: SystemPromptValue;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <>
      <Explained
        title={t('promptInspect.effective')}
        info={t('promptInspect.systemInfo')}
        t={t}
        tag={value.pending ? t('promptInspect.pending') : undefined}
      />
      {value.pending ? (
        <p {...stylex.props(styles.meta)}>{t('promptInspect.pendingHint')}</p>
      ) : null}
      {value.loaded ? null : <p {...stylex.props(styles.meta)}>{t('promptInspect.notLoaded')}</p>}
      {value.effectiveText === null ? (
        <p {...stylex.props(styles.meta)}>{t('promptInspect.none')}</p>
      ) : (
        <details>
          <summary {...stylex.props(styles.summary)}>
            {t('promptInspect.fullText', { count: value.effectiveText.length })}
          </summary>
          <pre {...stylex.props(styles.block)}>{value.effectiveText}</pre>
        </details>
      )}
      {value.next === null ? null : (
        <>
          <h3 {...stylex.props(styles.title)}>
            {t('promptInspect.sections', { count: value.next.sections.length })}
          </h3>
          {value.next.sections.map((section) => (
            <details key={section.name}>
              <summary {...stylex.props(styles.summary)}>
                {section.name} · {section.text.length}
              </summary>
              <pre {...stylex.props(styles.block)}>{section.text}</pre>
            </details>
          ))}
          {value.next.contexts.length === 0 ? null : (
            <>
              <h3 {...stylex.props(styles.title)}>{t('promptInspect.contexts')}</h3>
              {value.next.contexts.map((context) => (
                <details key={context.name}>
                  <summary {...stylex.props(styles.summary)}>{context.name}</summary>
                  <pre {...stylex.props(styles.block)}>{context.text}</pre>
                </details>
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}

function TurnInputBody({
  value,
  t,
}: {
  value: TurnInputValue;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <>
      <Explained title={t('promptInspect.turnTitle')} info={t('promptInspect.turnInfo')} t={t} />
      {value.turns.length === 0 ? (
        <p {...stylex.props(styles.meta)}>{t('promptInspect.none')}</p>
      ) : (
        value.turns.map((turn) => (
          <section key={turn.turn}>
            <p {...stylex.props(styles.meta)}>
              {t('promptInspect.turn', { turn: turn.turn })}
              {turn.startedAt === undefined
                ? ''
                : ` · ${new Date(turn.startedAt).toLocaleString()}`}
            </p>
            {turn.messages.map((message, index) => (
              <div key={`${message.at}:${index}`}>
                <p {...stylex.props(styles.meta)}>
                  {t('promptInspect.step', { step: message.step })} ·{' '}
                  {message.source === 'runtime-context'
                    ? t('promptInspect.sourceRuntime')
                    : message.source === 'user'
                      ? t('promptInspect.sourceUser')
                      : message.source}
                </p>
                <pre {...stylex.props(styles.block)}>{message.text}</pre>
              </div>
            ))}
          </section>
        ))
      )}
    </>
  );
}

export function BotPromptViewer({
  slug,
  displayName,
  view,
  actions,
  t,
  onClose,
}: {
  slug: string;
  displayName: string;
  view: BotPromptView;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose(): void;
}): ReactElement {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'failed'; message: string }
    | { kind: 'system'; value: SystemPromptValue }
    | { kind: 'turn'; value: TurnInputValue }
  >({ kind: 'loading' });
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    setState({ kind: 'loading' });
    const load =
      view === 'system-prompt'
        ? actions.botSystemPrompt(slug).then((value) => ({ kind: 'system' as const, value }))
        : actions.botTurnInput(slug).then((value) => ({ kind: 'turn' as const, value }));
    void load.then(
      (next) => {
        if (active) setState(next);
      },
      (failure: unknown) => {
        if (active) setState({ kind: 'failed', message: errorMessage(failure) });
      },
    );
    return () => {
      active = false;
    };
  }, [actions, slug, view]);
  return (
    <PanelDialog
      size="wide"
      fill
      title={`${t(view === 'system-prompt' ? 'promptInspect.systemTitle' : 'promptInspect.turnTitle')} · ${displayName}`}
      closeLabel={t('approval.cancel')}
      onClose={onClose}
      bodyRef={mount}
    >
      {state.kind === 'loading' ? (
        <p role="status">{t('composerContext.loading')}</p>
      ) : state.kind === 'failed' ? (
        <p role="alert">{t('promptInspect.failed', { error: state.message })}</p>
      ) : state.kind === 'system' ? (
        <SystemPromptBody value={state.value} t={t} />
      ) : (
        <TurnInputBody value={state.value} t={t} />
      )}
    </PanelDialog>
  );
}
