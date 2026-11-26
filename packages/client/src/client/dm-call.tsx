import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import {
  desktopCall,
  desktopCallNotice,
  desktopCallView,
  formatCallDuration,
  type DesktopCall,
  type DesktopCallVisual,
} from './desktop-call.js';
import { askCallNotifications } from './call-presence.js';
import { openSettingsSection } from './environment-settings-source.js';
import { IconButton } from './ds/icon-button.js';
import { color } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { Tooltip } from './ds/tooltip.js';
import { useVoiceRipple } from './voice-ripple.js';

const styles = stylex.create({
  on: {
    color: { default: color.accent, ':hover': color.accent },
    backgroundColor: { default: color.selected, ':hover': color.selected },
  },
});

export function DmCallControl({
  slug,
  name,
  onReturn,
  t,
  variant = 'island',
  call = desktopCall(),
}: {
  slug: string;
  name: string;
  onReturn?: (() => void) | undefined;
  t: BotHarnessTranslate;
  variant?: 'island' | 'header';
  call?: DesktopCall;
}): ReactElement {
  const wrap = variant === 'island' ? 'bh-channel-island-wrap bh-call-control' : 'bh-call-control';
  const anchor = useRef<HTMLSpanElement>(null);
  const [place, setPlace] = useState<{ top: number; right: number }>();
  const dial = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (rect !== undefined)
      setPlace({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    askCallNotifications();
    void call.start(
      slug,
      onReturn === undefined
        ? undefined
        : {
            title: t('call.backgroundTitle', { name }),
            body: t('call.backgroundBody'),
            open: onReturn,
          },
    );
  };
  const snapshot = useSyncExternalStore(call.subscribe, call.snapshot, call.snapshot);
  const mine = snapshot.slug === slug;
  const view = mine ? desktopCallView(snapshot.state) : undefined;
  const elsewhere =
    !mine && (snapshot.state.status === 'opening' || snapshot.state.status === 'live');
  const micMuted =
    view !== undefined && (snapshot.sound === 'on' ? snapshot.micMuted === true : view.muted);
  const speaking = view !== undefined && snapshot.state.status === 'live' && !micMuted;
  const rippleMount = useVoiceRipple<HTMLSpanElement>(speaking, call.level);

  if (view !== undefined) {
    const time = formatCallDuration(view.durationMs);
    const camera = snapshot.visual.source === 'camera';
    const screen = snapshot.visual.source === 'screen';
    const sharing = snapshot.state.status !== 'live' || snapshot.visual.starting;
    const hearing = snapshot.sound === 'on';
    const soundLabel = hearing ? t('call.soundOff', { name }) : t('call.soundOn', { name });
    return (
      <span ref={anchor} className={wrap} data-variant={variant}>
        <div
          className="bh-call-island"
          role="group"
          aria-label={t('call.label', { name })}
          data-tone={view.tone}
        >
          <span className="bh-call-dot" aria-hidden="true" />
          <span className="bh-call-status" role="status" aria-live="polite">
            {t(view.status)}
          </span>
          <span className="bh-call-duration" aria-label={t('call.duration', { time })}>
            {time}
          </span>
          <IconButton
            aria-label={camera ? t('call.cameraOff') : t('call.cameraOn')}
            aria-pressed={camera}
            disabled={sharing}
            onClick={() => void call.camera(!camera)}
          >
            <ChannelSidebarIcon name={camera ? 'video' : 'video-off'} />
          </IconButton>
          <IconButton
            aria-label={screen ? t('call.screenOff') : t('call.screenOn')}
            aria-pressed={screen}
            disabled={sharing}
            onClick={() => void call.screen(!screen)}
          >
            <ChannelSidebarIcon name="monitor" />
          </IconButton>
          <Tooltip
            label={hearing ? soundLabel : t('call.soundTip', { name })}
            side="bottom"
            portal
            delayMs={500}
          >
            <IconButton
              aria-label={soundLabel}
              aria-pressed={hearing}
              xstyle={hearing ? styles.on : undefined}
              aria-busy={snapshot.sound === 'starting'}
              disabled={snapshot.state.status !== 'live' || snapshot.sound === 'starting'}
              onClick={() => void call.computerSound(!hearing)}
            >
              <ChannelSidebarIcon name="ear" />
            </IconButton>
          </Tooltip>
          <span
            ref={rippleMount}
            className="bh-call-mic bh-voice-ripple"
            data-ripple={speaking ? 'on' : undefined}
          >
            <IconButton
              aria-label={micMuted ? t('call.unmute') : t('call.mute')}
              aria-pressed={micMuted}
              data-muted={micMuted}
              disabled={snapshot.state.status !== 'live'}
              onClick={() => void call.mute(!micMuted)}
            >
              <ChannelSidebarIcon name={micMuted ? 'mic-off' : 'mic'} />
            </IconButton>
          </span>
          <button
            type="button"
            className="bh-call-hangup"
            aria-label={t('call.hangUp')}
            onClick={() => void call.hangup()}
          >
            <ChannelSidebarIcon name="phone-off" />
          </button>
        </div>
        {camera || screen || snapshot.visual.error !== undefined
          ? createPortal(
              <CallCameraPanel
                visual={snapshot.visual}
                t={t}
                place={panelPlace(anchor.current)}
                onClose={() => call.dismissVisual()}
              />,
              document.body,
            )
          : null}
        {snapshot.sound === 'missing'
          ? createPortal(
              <div className="bh-call-notice" role="alert" style={panelPlace(anchor.current)}>
                <p>{t('call.soundMissing')}</p>
                <span className="bh-call-notice-actions">
                  <button type="button" onClick={() => void call.computerSound(true)}>
                    {t('call.soundRetry')}
                  </button>
                  <button type="button" onClick={() => void call.computerSound(false)}>
                    {t('call.close')}
                  </button>
                </span>
              </div>,
              document.body,
            )
          : null}
      </span>
    );
  }

  const notice = mine ? desktopCallNotice(snapshot) : undefined;
  const missing = mine && snapshot.block?.kind === 'missing';
  const voiceSetup =
    mine &&
    snapshot.block?.notices.some((key) => key === 'missing.asr' || key === 'missing.tts') === true;
  return (
    <span ref={anchor} className={wrap} data-variant={variant}>
      <Tooltip label={t('call.start', { name })} side="bottom" portal delayMs={500}>
        <IconButton
          aria-label={t('call.start', { name })}
          aria-busy={mine && snapshot.checking}
          disabled={elsewhere || (mine && snapshot.checking)}
          onClick={dial}
        >
          <ChannelSidebarIcon name="phone" />
        </IconButton>
      </Tooltip>
      {elsewhere ? (
        <button
          type="button"
          className="bh-call-hangup"
          aria-label={t('call.hangUpCurrent')}
          onClick={() => void call.hangup()}
        >
          <ChannelSidebarIcon name="phone-off" />
        </button>
      ) : null}
      {notice === undefined
        ? null
        : createPortal(
            <div className="bh-call-notice" role="alert" style={place}>
              {missing ? <strong>{t('call.unavailable')}</strong> : null}
              {notice.map((key) => (
                <p key={key}>{t(key)}</p>
              ))}
              <span className="bh-call-notice-actions">
                {voiceSetup ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (openSettingsSection('voice')) call.dismiss();
                    }}
                  >
                    {t('call.openVoiceSettings')}
                  </button>
                ) : null}
                {missing ? null : (
                  <button type="button" onClick={dial}>
                    {t('call.again')}
                  </button>
                )}
                <button type="button" onClick={() => call.dismiss()}>
                  {t('call.close')}
                </button>
              </span>
            </div>,
            document.body,
          )}
    </span>
  );
}

function panelPlace(element: HTMLElement | null): { top: number; right: number } | undefined {
  const rect = element?.getBoundingClientRect();
  if (rect === undefined) return undefined;
  return { top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) };
}

const VISUAL_ERRORS = {
  'camera-denied': 'call.cameraDenied',
  'camera-missing': 'call.cameraMissing',
  'camera-stopped': 'call.cameraStopped',
  'screen-missing': 'call.screenMissing',
  'screen-stopped': 'call.screenStopped',
} as const satisfies Record<NonNullable<DesktopCallVisual['error']>, string>;

export function CallCameraPanel({
  visual,
  t,
  place,
  onClose,
}: {
  visual: DesktopCallVisual;
  t: BotHarnessTranslate;
  place: { top: number; right: number } | undefined;
  onClose: () => void;
}): ReactElement {
  const attach = (element: HTMLVideoElement | null) => {
    const stream = visual.stream ?? null;
    if (element === null || element.srcObject === stream) return;
    element.srcObject = stream;
    if (stream !== null)
      void Promise.resolve()
        .then(() => element.play())
        .catch(() => undefined);
  };
  if (visual.error !== undefined && visual.source === 'off')
    return (
      <div className="bh-call-camera" role="alert" style={place}>
        <p className="bh-call-camera-error">{t(VISUAL_ERRORS[visual.error])}</p>
        <button type="button" className="bh-call-camera-close" onClick={onClose}>
          {t('call.close')}
        </button>
      </div>
    );
  const screen = visual.source === 'screen';
  return (
    <div
      className="bh-call-camera"
      role="group"
      aria-label={t(screen ? 'call.screenPreview' : 'call.cameraPreview')}
      data-source={visual.source}
      style={place}
    >
      <div className="bh-call-camera-frame">
        <video ref={attach} className="bh-call-camera-video" muted playsInline autoPlay />
        <span
          key={visual.keyframes}
          className="bh-call-camera-flash"
          data-flash={visual.keyframes > 0}
          aria-hidden="true"
        />
      </div>
      {screen ? (
        <p className="bh-call-camera-label">
          {visual.label === undefined
            ? t('call.screenSharingUnnamed')
            : t('call.screenSharing', { name: visual.label })}
        </p>
      ) : null}
      <p className="bh-call-camera-meta" role="status" aria-live="polite">
        {visual.keyframes > 0
          ? t('call.cameraKeyframes', { count: String(visual.keyframes) })
          : t('call.cameraWaiting')}
      </p>
    </div>
  );
}
