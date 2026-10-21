import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { pagePoint } from '../../../../apps/mobile/src/host/browser-viewer.js';
import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import { PanelEmptyState } from './ds/empty-state.js';
import { border, color, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { createRemoteHostViewer, type RemoteViewerKind } from './remote-host-viewer.js';
import { ViewerTitleBar } from './remote-viewer/index.js';
import type { ViewerKey } from './remote-viewer/locale.js';

const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 },
  stage: {
    position: 'relative',
    flexGrow: 1,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: color.well,
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
  frame: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    userSelect: 'none',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.x3,
    padding: space.x3,
  },
  input: { flexGrow: 1, minWidth: 0 },
  notice: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.x3,
    margin: 0,
    padding: space.x3,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});

const titleKeys = {
  'entry.live': 'remoteViewer.live',
  'entry.noScreen': 'remoteViewer.unavailable',
  'entry.connecting': 'remoteViewer.loading',
  'entry.reconnecting': 'remoteViewer.loading',
  'entry.reconnect': 'remoteViewer.retry',
  'entry.openFullscreen': 'remoteViewer.open',
  'entry.collapseFullscreen': 'remoteViewer.close',
  'entry.interactive.disable': 'remoteViewer.resume',
  'entry.interactive.enable': 'remoteViewer.takeover',
  'entry.watchOnly': 'remoteViewer.watch',
  'entry.stop': 'remoteViewer.close',
  'entry.stopping': 'remoteViewer.loading',
} as const;

export function RemoteHostViewerPanel({
  client,
  kind,
  slug,
  hostName,
  t,
  onClose,
}: {
  client: HostClient;
  kind: RemoteViewerKind;
  slug: string;
  hostName: string;
  t: BotHarnessTranslate;
  onClose(): void;
}): ReactElement {
  const [attempt, setAttempt] = useState(0);
  const viewer = useMemo(
    () => createRemoteHostViewer(client, kind, slug),
    [client, kind, slug, attempt],
  );
  const state = useSyncExternalStore(viewer.subscribe, viewer.getSnapshot, viewer.getSnapshot);
  const [typed, setTyped] = useState('');
  const title = `${t(`remoteViewer.${kind}`)} · ${hostName}`;
  const live = state.status === 'live' && state.frame !== undefined;
  const driving = live && state.control && !state.switching;
  const unavailable =
    state.status === 'not-running'
      ? t(`remoteViewer.${kind}Stopped`)
      : state.status === 'refused'
        ? t('remoteViewer.refused')
        : state.status === 'no-access'
          ? t('remoteViewer.noAccess')
          : state.status === 'loading'
            ? t('remoteViewer.loading')
            : t('remoteViewer.unreachable');
  return (
    <section {...stylex.props(styles.root)} aria-label={title} data-remote-viewer={kind}>
      <ViewerTitleBar
        t={(key: ViewerKey) => t(titleKeys[key])}
        title={title}
        phase={live ? 'live' : state.status === 'loading' ? 'connecting' : 'empty'}
        reconnecting={false}
        busy={!live || state.switching}
        stopping={false}
        interactive={state.control}
        onToggleInteractive={() => void viewer.setControl(!state.control)}
        onStop={onClose}
        onCollapse={onClose}
        hideStop
      />
      {live ? (
        <div
          {...stylex.props(styles.stage)}
          role="group"
          aria-label={t('remoteViewer.screen')}
          tabIndex={driving ? 0 : -1}
          onClick={(event) => {
            if (!driving || state.frame === undefined) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const point = pagePoint(
              { x: event.clientX - rect.left, y: event.clientY - rect.top },
              state.frame,
              rect,
            );
            if (point !== undefined) void viewer.send({ kind: 'click', ...point });
            event.currentTarget.focus();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            if (!driving || state.frame === undefined) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const point = pagePoint(
              { x: event.clientX - rect.left, y: event.clientY - rect.top },
              state.frame,
              rect,
            );
            if (point !== undefined) void viewer.send({ kind: 'click', button: 'right', ...point });
          }}
          onWheel={(event) => {
            if (!driving || state.frame === undefined || event.deltaY === 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const point = pagePoint(
              { x: event.clientX - rect.left, y: event.clientY - rect.top },
              state.frame,
              rect,
            );
            if (point !== undefined)
              void viewer.send({
                kind: 'scroll',
                direction: event.deltaY > 0 ? 'down' : 'up',
                amount: kind === 'computer' ? 3 : 300,
                ...point,
              });
          }}
          onKeyDown={(event) => {
            if (!driving || event.nativeEvent.isComposing || event.key === 'Tab') return;
            const key = (
              {
                Enter: 'return',
                Backspace: 'delete',
                Escape: 'escape',
                ArrowLeft: 'left',
                ArrowRight: 'right',
                ArrowUp: 'up',
                ArrowDown: 'down',
              } as Record<string, string>
            )[event.key];
            if (key === undefined) return;
            event.preventDefault();
            void viewer.send({ kind: 'key', key: kind === 'browser' ? event.key : key });
          }}
        >
          <img
            {...stylex.props(styles.frame)}
            src={state.frame?.uri}
            alt={t('remoteViewer.screen')}
            draggable={false}
          />
        </div>
      ) : (
        <PanelEmptyState
          icon={kind === 'computer' ? 'monitor' : 'globe'}
          action={
            state.status === 'refused' || state.status === 'loading' ? undefined : (
              <Button size="sm" variant="ghost" onClick={() => setAttempt((value) => value + 1)}>
                {t('remoteViewer.retry')}
              </Button>
            )
          }
        >
          {unavailable}
        </PanelEmptyState>
      )}
      {state.notice === undefined || !live ? null : (
        <div role="status" {...stylex.props(styles.notice)}>
          <span>{t('remoteViewer.actionUnconfirmed')}</span>
          <Button size="sm" variant="ghost" onClick={() => setAttempt((value) => value + 1)}>
            {t('remoteViewer.retry')}
          </Button>
        </div>
      )}
      <form
        {...stylex.props(styles.controls)}
        data-companion-avoid
        onSubmit={(event) => {
          event.preventDefault();
          if (!driving || typed === '') return;
          void viewer.send({ kind: 'type', text: typed });
          setTyped('');
        }}
      >
        <div {...stylex.props(styles.input)}>
          <Input
            aria-label={t('remoteViewer.type')}
            placeholder={t('remoteViewer.type')}
            type="password"
            maxLength={4000}
            autoComplete="off"
            value={typed}
            disabled={!driving}
            onChange={(event) => setTyped(event.currentTarget.value)}
          />
        </div>
        <Button size="sm" type="submit" disabled={!driving || typed === ''}>
          {t('remoteViewer.send')}
        </Button>
        <Button
          size="sm"
          type="button"
          disabled={!driving}
          onClick={() =>
            void viewer.send({ kind: 'key', key: kind === 'browser' ? 'Enter' : 'return' })
          }
        >
          {t('remoteViewer.enter')}
        </Button>
        <Button
          size="sm"
          type="button"
          disabled={!driving}
          onClick={() => void viewer.send({ kind: 'key', key: kind === 'browser' ? 'Tab' : 'tab' })}
        >
          {t('remoteViewer.tab')}
        </Button>
      </form>
    </section>
  );
}
