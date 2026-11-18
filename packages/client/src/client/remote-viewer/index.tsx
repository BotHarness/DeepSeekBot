import { Icon } from '../ds/icon.js';
import { PillButton } from '../ds/pill-button.js';
import { Button } from '../ds/button.js';
import {
  Fragment,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefCallback,
} from 'react';
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { useMountedResource } from '../mounted-resource.js';
import { BH, VIDEO_SURFACE } from './tokens.js';
import {
  dotStateFor,
  nextExpanded,
  smoothPhase,
  statusKeyFor,
  stopKey,
  type FramePhase,
} from './viewer-state.js';
import {
  LOSS_REMOUNT_AFTER,
  nextStreamTracker,
  sampleSurface,
  shouldAutoReload,
  shouldRemountLoss,
  type StreamTracker,
} from './frame-liveness.js';
import type { ViewerTranslate } from './locale.js';
export type ViewerLifecycleEvent =
  | { readonly type: 'mount' }
  | { readonly type: 'overlay'; readonly open: boolean }
  | {
      readonly type: 'phase';
      readonly from: FramePhase;
      readonly to: FramePhase;
    }
  | { readonly type: 'auto-reload'; readonly attempt: number }
  | { readonly type: 'manual-retry' }
  | { readonly type: 'loss-remount'; readonly streak: number };

export const SPIN_STYLE = '@keyframes bc-spin { to { transform: rotate(360deg); } }';

function useStreamPhase(onSample: (phase: FramePhase) => void): RefCallback<HTMLIFrameElement> {
  return useMountedResource<HTMLIFrameElement>(
    (iframe) => {
      let active = true;
      let tracker: StreamTracker = { misses: 0, busyStreak: 0, quiet: 0 };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const check = (): void => {
        if (!active) return;
        let doc: Document | null = null;
        try {
          doc = iframe.contentDocument;
        } catch {
          doc = null;
        }
        const next = nextStreamTracker(tracker, sampleSurface(doc));
        tracker = next.tracker;
        onSample(next.phase);
        timer = setTimeout(check, 1000);
      };
      timer = setTimeout(check, 300);
      return () => {
        active = false;
        if (timer !== undefined) clearTimeout(timer);
      };
    },
    [onSample],
  );
}

export function ScreenIndicator({ label = '连接中' }: { readonly label?: string }): ReactElement {
  const size = 26;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: VIDEO_SURFACE.background,
        color: VIDEO_SURFACE.onVideo,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <svg
          width={size}
          height={size}
          style={{ animation: 'bc-spin 1.1s linear infinite' }}
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={VIDEO_SURFACE.spinnerTrack}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={VIDEO_SURFACE.spinnerArc}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${String(circumference * 0.28)} ${String(circumference * 0.72)}`}
          />
        </svg>
        <span style={{ fontSize: 12.5, opacity: 0.7 }}>{label}</span>
      </div>
    </div>
  );
}

function ScreenEmpty({
  t,
  onRetry,
}: {
  readonly t: ViewerTranslate;
  readonly onRetry: () => void;
}): ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: VIDEO_SURFACE.background,
        color: VIDEO_SURFACE.onVideo,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 12.5, opacity: 0.75 }}>{t('entry.noScreen')}</span>
        <Button variant="toolbar" size="sm" onClick={onRetry}>
          {t('entry.reconnect')}
        </Button>
      </div>
    </div>
  );
}

export interface StreamOverlayProps {
  readonly phase: FramePhase;
  readonly reconnecting: boolean;
  readonly hovered: boolean;
  readonly t: ViewerTranslate;
  readonly onRetry: () => void;
  readonly onOpen: () => void;
}

export function StreamOverlay(props: StreamOverlayProps): ReactElement | null {
  const { phase, reconnecting, hovered, t, onRetry, onOpen } = props;
  if (phase === 'connecting') {
    return <ScreenIndicator label={t(statusKeyFor(phase, reconnecting))} />;
  }
  if (phase === 'empty') {
    return <ScreenEmpty t={t} onRetry={onRetry} />;
  }
  if (!hovered) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: BH.hoverScrim,
        borderRadius: 8,
      }}
    >
      <PillButton onClick={onOpen} variant="primary">
        <Icon name="maximize" size={14} />
        {t('entry.openFullscreen')}
      </PillButton>
    </div>
  );
}

interface ScaledFrameProps {
  readonly src: string;
  readonly title: string;
  readonly design: { width: number; height: number };
  readonly interactive: boolean;
  readonly fit?: 'width' | 'contain';
  readonly iframeRef?: RefCallback<HTMLIFrameElement>;
}

function ScaledFrame({
  src,
  title,
  design,
  interactive,
  fit = 'width',
  iframeRef,
}: ScaledFrameProps): ReactElement {
  const DESIGN_WIDTH = design.width;
  const DESIGN_HEIGHT = design.height;
  const [box, setBox] = useState({
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  });
  const resizeResource = useMountedResource<HTMLDivElement>(
    (element) => {
      const frame = element.querySelector('iframe');
      if (frame !== null) {
        frame.inert = !interactive;
        if (!interactive) frame.blur();
      }
      const update = (): void =>
        setBox({ width: element.clientWidth, height: element.clientHeight });
      update();
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [interactive],
  );

  const scale =
    fit === 'contain'
      ? Math.min(box.width / DESIGN_WIDTH, box.height / DESIGN_HEIGHT)
      : box.width / DESIGN_WIDTH;
  const offsetX = fit === 'contain' ? Math.max(0, (box.width - DESIGN_WIDTH * scale) / 2) : 0;
  const offsetY = fit === 'contain' ? Math.max(0, (box.height - DESIGN_HEIGHT * scale) / 2) : 0;

  return (
    <div
      ref={resizeResource}
      style={{
        position: 'relative',
        width: '100%',
        ...(fit === 'width'
          ? {
              aspectRatio: `${String(DESIGN_WIDTH)} / ${String(DESIGN_HEIGHT)}`,
              border: `1px solid ${BH.borderL3}`,
              borderRadius: 8,
            }
          : { height: '100%' }),
        overflow: 'hidden',
        background: VIDEO_SURFACE.background,
      }}
    >
      <iframe
        ref={iframeRef}
        title={title}
        src={src}
        tabIndex={interactive ? 0 : -1}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          border: 'none',
          transform: `translate(${String(offsetX)}px, ${String(offsetY)}px) scale(${String(scale)})`,
          transformOrigin: 'top left',
          pointerEvents: interactive ? 'auto' : 'none',
        }}
      />
    </div>
  );
}

function CollapseIcon(): ReactElement {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

export interface ViewerTitleBarProps {
  readonly t: ViewerTranslate;
  readonly title: string;
  readonly phase: FramePhase;
  readonly reconnecting: boolean;
  readonly busy: boolean;
  readonly stopping: boolean;
  readonly interactive: boolean;
  readonly extraControls?: ReactNode;
  readonly onToggleInteractive: () => void;
  readonly onStop: () => void;
  readonly onCollapse: () => void;
  readonly hideStop?: boolean | undefined;
  readonly hideInteractiveToggle?: boolean | undefined;
}

function StopButton({
  t,
  busy,
  stopping,
  onStop,
}: {
  readonly t: ViewerTranslate;
  readonly busy: boolean;
  readonly stopping: boolean;
  readonly onStop: () => void;
}): ReactElement {
  return (
    <Button variant="ghost" size="sm" disabled={busy || stopping} onClick={onStop}>
      {busy || stopping ? t('entry.stopping') : t('entry.stop')}
    </Button>
  );
}

export function ViewerTitleBar(props: ViewerTitleBarProps): ReactElement {
  const {
    t,
    title,
    phase,
    reconnecting,
    busy,
    stopping,
    interactive,
    extraControls,
    onToggleInteractive,
    onStop,
    onCollapse,
    hideStop,
    hideInteractiveToggle,
  } = props;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 44,
        flex: '0 0 auto',
        padding: '0 8px 0 14px',
        borderBottom: `1px solid ${BH.borderL2}`,
        color: BH.labelPrimary,
        background: BH.bgBase,
      }}
    >
      <StateDot state={dotStateFor(phase)} />
      <strong
        style={{
          fontSize: 13,
          fontWeight: 600,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </strong>
      <span style={{ fontSize: 12, opacity: 0.65 }}>{t(statusKeyFor(phase, reconnecting))}</span>
      {interactive ? null : (
        <span style={{ fontSize: 12, opacity: 0.65 }}>{t('entry.watchOnly')}</span>
      )}
      <span style={{ flex: 1 }} />
      {extraControls}
      {hideInteractiveToggle ? null : (
        <Button
          variant={interactive ? 'ghost' : 'primary'}
          size="sm"
          aria-pressed={interactive}
          onClick={onToggleInteractive}
          disabled={busy || stopping}
          title={t(interactive ? 'entry.interactive.disable' : 'entry.interactive.enable')}
        >
          {t(interactive ? 'entry.interactive.disable' : 'entry.interactive.enable')}
        </Button>
      )}
      {hideStop === true ? null : (
        <StopButton t={t} busy={busy} stopping={stopping} onStop={onStop} />
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onCollapse}
        aria-label={t('entry.collapseFullscreen')}
        title={t('entry.collapseFullscreen')}
      >
        <CollapseIcon />
      </Button>
    </div>
  );
}

export interface RemoteViewerProps {
  readonly t: ViewerTranslate;
  readonly title: string;
  readonly src: string;
  readonly design: { width: number; height: number };
  readonly busy: boolean;
  readonly stopping: boolean;
  readonly onStop: () => void;
  readonly footer?: ReactNode;
  readonly notice?: ReactNode;
  readonly extraControls?: ReactNode;
  readonly onEvent?: (event: ViewerLifecycleEvent) => void;
  readonly interactive?: boolean;
  readonly onToggleInteractive?: () => void;
  readonly onDisableInteraction?: () => void;
  readonly expanded?: boolean;
  readonly onExpandedChange?: (expanded: boolean) => void;
  readonly hideStop?: boolean | undefined;
  readonly hideInteractiveToggle?: boolean | undefined;
  readonly allowFrameInput?: boolean | undefined;
}

export function RemoteViewer({
  t,
  title,
  src,
  design,
  busy,
  stopping,
  onStop,
  footer,
  notice,
  extraControls,
  onEvent,
  interactive,
  onToggleInteractive,
  onDisableInteraction,
  expanded: controlledExpanded,
  onExpandedChange,
  hideStop,
  hideInteractiveToggle,
  allowFrameInput,
}: RemoteViewerProps): ReactElement {
  const entryRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [ownExpanded, setOwnExpanded] = useState(false);
  const expanded = controlledExpanded ?? ownExpanded;
  const setExpanded = (next: boolean): void => {
    setOwnExpanded(next);
    onExpandedChange?.(next);
  };
  const [inputEnabled, setInputEnabled] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const wasReady = useRef(false);
  const autoReloads = useRef(0);
  const lossStreak = useRef(0);
  const phaseRef = useRef<FramePhase>('connecting');

  const [smooth, setSmooth] = useState<{ phase: FramePhase; streak: number }>({
    phase: 'connecting',
    streak: 0,
  });
  const resetFrame = useCallback(() => {
    phaseRef.current = 'connecting';
    setSmooth({ phase: 'connecting', streak: 0 });
    setReloadKey((key) => key + 1);
  }, []);
  const onSample = useCallback(
    (nextPhase: FramePhase): void => {
      const fromPhase = phaseRef.current;
      if (fromPhase !== nextPhase) {
        phaseRef.current = nextPhase;
        setSmooth((current) => smoothPhase(current.phase, nextPhase, current.streak));
        onEvent?.({ type: 'phase', from: fromPhase, to: nextPhase });
      }
      if (nextPhase === 'live') {
        wasReady.current = true;
        autoReloads.current = 0;
        lossStreak.current = 0;
        setReconnecting(false);
        return;
      }
      if (wasReady.current) {
        lossStreak.current += 1;
        if (shouldRemountLoss(lossStreak.current)) {
          wasReady.current = false;
          lossStreak.current = 0;
          onEvent?.({ type: 'loss-remount', streak: LOSS_REMOUNT_AFTER });
          setReconnecting(true);
          resetFrame();
          return;
        }
      }
      if (
        fromPhase !== nextPhase &&
        shouldAutoReload(nextPhase, wasReady.current, autoReloads.current)
      ) {
        autoReloads.current += 1;
        onEvent?.({ type: 'auto-reload', attempt: autoReloads.current });
        resetFrame();
      }
    },
    [resetFrame, onEvent],
  );
  const streamRef = useStreamPhase(onSample);
  const phase = smooth.phase;

  const reconnect = (): void => {
    onEvent?.({ type: 'manual-retry' });
    setReconnecting(true);
    autoReloads.current = 0;
    lossStreak.current = 0;
    wasReady.current = false;
    resetFrame();
  };
  const openViewer = (): void => {
    setExpanded(nextExpanded('open'));
    onEvent?.({ type: 'overlay', open: true });
  };
  const collapseViewer = (): void => {
    setInputEnabled(false);
    onDisableInteraction?.();
    setExpanded(nextExpanded('collapse'));
    onEvent?.({ type: 'overlay', open: false });
    requestAnimationFrame(() => entryRef.current?.focus());
  };
  const dialogResource = useMountedResource<HTMLDivElement>(
    (dialog) => {
      if (!mounted.current) {
        mounted.current = true;
        onEvent?.({ type: 'mount' });
      }
      if (!expanded) return;
      const onKey = (event: KeyboardEvent): void => {
        if (event.key !== 'Tab') return;
        const focusable = [
          ...dialog.querySelectorAll<HTMLElement>(
            'button, [href], iframe, [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((element) => element.tabIndex !== -1);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (first === undefined || last === undefined) return;
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === dialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      };
      document.addEventListener('keydown', onKey);
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.focus();
      return () => {
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = previousOverflow;
      };
    },
    [expanded, onDisableInteraction, onEvent],
  );

  const statusText = t(statusKeyFor(phase, reconnecting));
  const openable = phase === 'live' && !expanded;

  const overlay = (
    <StreamOverlay
      phase={phase}
      reconnecting={reconnecting}
      hovered={expanded ? false : hovered}
      t={t}
      onRetry={reconnect}
      onOpen={openViewer}
    />
  );

  const stopLabel = t(stopKey(busy, stopping));
  const rowButton = (disabled: boolean): CSSProperties => ({
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    padding: '0 10px',
    borderRadius: 14,
    border: `1px solid ${BH.borderL3}`,
    background: BH.buttonElevatedFill,
    color: BH.labelPrimary,
    fontSize: 12,
    ...(disabled ? { opacity: 0.4, cursor: 'not-allowed' } : { cursor: 'pointer' }),
  });

  return (
    <div
      ref={dialogResource}
      data-bh-remote-viewer-fullscreen={expanded ? '' : undefined}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded ? true : undefined}
      aria-label={expanded ? title : undefined}
      tabIndex={expanded ? -1 : undefined}
      style={
        expanded
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              background: BH.bgBase,
              color: BH.labelPrimary,
            }
          : { display: 'flex', flexDirection: 'column', gap: 8 }
      }
    >
      <style>{SPIN_STYLE}</style>
      {expanded ? (
        <ViewerTitleBar
          key="viewer-titlebar"
          t={t}
          title={title}
          phase={phase}
          reconnecting={reconnecting}
          busy={busy}
          stopping={stopping}
          extraControls={extraControls}
          interactive={interactive ?? inputEnabled}
          onToggleInteractive={
            onToggleInteractive ?? (() => setInputEnabled((current) => !current))
          }
          onStop={onStop}
          onCollapse={collapseViewer}
          hideStop={hideStop}
          hideInteractiveToggle={hideInteractiveToggle}
        />
      ) : null}
      {notice}
      <div
        key="viewer-frame"
        ref={entryRef}
        role={openable ? 'button' : undefined}
        tabIndex={openable ? 0 : undefined}
        aria-label={openable ? t('entry.openFullscreen') : statusText}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (openable) openViewer();
        }}
        onKeyDown={(event) => {
          if (!openable) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openViewer();
        }}
        style={
          expanded
            ? { position: 'relative', flex: 1, minHeight: 0 }
            : { position: 'relative', cursor: openable ? 'pointer' : 'default' }
        }
      >
        <ScaledFrame
          key={reloadKey}
          src={src}
          title={title}
          design={design}
          interactive={allowFrameInput === true ? true : expanded && (interactive ?? inputEnabled)}
          fit={expanded ? 'contain' : 'width'}
          iframeRef={streamRef}
        />
        {overlay}
      </div>
      {expanded ? null : (
        <Fragment key="viewer-chrome">
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: BH.labelPrimary,
              opacity: 0.9,
              textAlign: 'center',
            }}
          >
            {title}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {hideStop === true ? null : (
              <button
                type="button"
                disabled={busy || stopping}
                onClick={onStop}
                style={rowButton(busy || stopping)}
              >
                {stopLabel}
              </button>
            )}
            <button
              type="button"
              onClick={reconnect}
              title={t('entry.reconnect')}
              style={rowButton(false)}
            >
              {t('entry.reconnect')}
            </button>
          </div>
          {footer}
        </Fragment>
      )}
    </div>
  );
}
