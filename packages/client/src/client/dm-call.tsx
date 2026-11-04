import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import {
  desktopCall,
  desktopCallNotice,
  desktopCallView,
  formatCallDuration,
  type DesktopCall,
} from './desktop-call.js';
import { IconButton } from './ds/icon-button.js';
import type { BotHarnessTranslate } from './locale.js';
import { Tooltip } from './ds/tooltip.js';

export function DmCallControl({
  slug,
  name,
  t,
  variant = 'island',
  call = desktopCall(),
}: {
  slug: string;
  name: string;
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
    void call.start(slug);
  };
  const snapshot = useSyncExternalStore(call.subscribe, call.snapshot, call.snapshot);
  const mine = snapshot.slug === slug;
  const view = mine ? desktopCallView(snapshot.state) : undefined;
  const elsewhere =
    !mine && (snapshot.state.status === 'opening' || snapshot.state.status === 'live');

  if (view !== undefined) {
    const time = formatCallDuration(view.durationMs);
    return (
      <span className={wrap} data-variant={variant}>
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
            aria-label={view.muted ? t('call.unmute') : t('call.mute')}
            aria-pressed={view.muted}
            data-muted={view.muted}
            disabled={snapshot.state.status !== 'live'}
            onClick={() => void call.mute(!view.muted)}
          >
            <ChannelSidebarIcon name={view.muted ? 'mic-off' : 'mic'} />
          </IconButton>
          <button
            type="button"
            className="bh-call-hangup"
            aria-label={t('call.hangUp')}
            onClick={() => void call.hangup()}
          >
            <ChannelSidebarIcon name="phone-off" />
          </button>
        </div>
      </span>
    );
  }

  const notice = mine ? desktopCallNotice(snapshot) : undefined;
  const missing = mine && snapshot.block?.kind === 'missing';
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
