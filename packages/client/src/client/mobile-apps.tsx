import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Button, IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { COMMUNITY } from './community-links.js';
import { CommunityIcon } from './community-icons.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Tooltip } from './ds/tooltip.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotHarnessTranslate } from './locale.js';

export const TESTFLIGHT_URL = 'https://testflight.apple.com/join/sA9EznXr';

const SEEN_KEY = 'botharness/mobile-apps/seen';

export function mobileAppsSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function markMobileAppsSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {}
}

export function MobileAppsEntry({ t }: { t: BotHarnessTranslate }): ReactElement {
  const trigger = useRef<HTMLButtonElement>(null);
  const [seen, setSeen] = useState(mobileAppsSeen);
  const [open, setOpen] = useState(false);
  const show = () => {
    markMobileAppsSeen();
    setSeen(true);
    setOpen(true);
  };
  return (
    <span>
      <Tooltip label={t('mobileApps.open')} side="right">
        <button
          ref={trigger}
          type="button"
          aria-label={t('mobileApps.open')}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-mobile-apps-entry=""
          onClick={() => (open ? setOpen(false) : show())}
        >
          <ChannelSidebarIcon name="smartphone" />
        </button>
      </Tooltip>
      {open ? (
        <MobileAppsPopover trigger={trigger} t={t} onClose={() => setOpen(false)} />
      ) : seen ? null : (
        <MobileAppsHint
          trigger={trigger}
          t={t}
          onOpen={show}
          onDismiss={() => {
            markMobileAppsSeen();
            setSeen(true);
          }}
        />
      )}
    </span>
  );
}

function usePlacement(
  trigger: RefObject<HTMLButtonElement | null>,
  width: number,
): [CSSProperties, (node: HTMLDivElement) => () => void] {
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const attach = (node: HTMLDivElement) => {
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect === undefined) return;
      const fit = Math.min(width, window.innerWidth - 32);
      const right = rect.left + rect.width / 2 < window.innerWidth / 2;
      node.dataset.side = right ? 'right' : 'left';
      setPosition({
        width: fit,
        left: right
          ? Math.min(rect.right + 8, window.innerWidth - fit - 16)
          : Math.max(16, rect.left - fit - 8),
        bottom: Math.max(16, window.innerHeight - rect.bottom),
        ['--bh-mobile-apps-arrow' as string]: `${rect.height / 2 - 6}px`,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  };
  return [position, attach];
}

function MobileAppsHint({
  trigger,
  t,
  onOpen,
  onDismiss,
}: {
  trigger: RefObject<HTMLButtonElement | null>;
  t: BotHarnessTranslate;
  onOpen(): void;
  onDismiss(): void;
}): ReactElement {
  const titleId = useId();
  const [position, attach] = usePlacement(trigger, 260);
  const mount = useMountedResource<HTMLDivElement>((node) => attach(node), []);
  return createPortal(
    <div
      ref={mount}
      className="bh-mobile-apps-hint"
      data-bh-appearance-owned=""
      role="dialog"
      aria-labelledby={titleId}
      style={position}
    >
      <div className="bh-mobile-apps-head">
        <strong id={titleId}>{t('mobileApps.hintTitle')}</strong>
        <button type="button" aria-label={t('mobileApps.dismiss')} onClick={onDismiss}>
          <IconCloseOutlineRegular size={16} />
        </button>
      </div>
      <p className="bh-mobile-apps-caption">{t('mobileApps.hint')}</p>
      <Button variant="primary" size="sm" className="bh-mobile-apps-primary" onClick={onOpen}>
        {t('mobileApps.hintAction')}
      </Button>
    </div>,
    document.body,
  );
}

function MobileAppsPopover({
  trigger,
  t,
  onClose,
}: {
  trigger: RefObject<HTMLButtonElement | null>;
  t: BotHarnessTranslate;
  onClose(): void;
}): ReactElement {
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const [position, attach] = usePlacement(trigger, 320);
  const close = useRef(onClose);
  close.current = onClose;
  const mount = useMountedResource<HTMLDivElement>((node) => {
    const detach = attach(node);
    node.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !node.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        close.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      close.current();
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      detach();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return createPortal(
    <div
      ref={mount}
      className="bh-mobile-apps-popover"
      data-bh-appearance-owned=""
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={position}
    >
      <div className="bh-mobile-apps-head">
        <strong id={titleId}>{t('mobileApps.title')}</strong>
        <button
          type="button"
          aria-label={t('mobileApps.close')}
          onClick={() => {
            onClose();
            trigger.current?.focus();
          }}
        >
          <IconCloseOutlineRegular size={16} />
        </button>
      </div>
      <section className="bh-mobile-apps-section" data-platform="ios">
        <h3>{t('mobileApps.ios')}</h3>
        <p className="bh-mobile-apps-caption">{t('mobileApps.iosHint')}</p>
        <a
          className="bh-mobile-apps-link"
          href={TESTFLIGHT_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ChannelSidebarIcon name="smartphone" size={16} />
          <span>{t('mobileApps.testflight')}</span>
          <ChannelSidebarIcon name="external-link" size={14} />
        </a>
      </section>
      <section className="bh-mobile-apps-section" data-platform="android">
        <h3>{t('mobileApps.android')}</h3>
        <p className="bh-mobile-apps-caption">{t('mobileApps.androidHint')}</p>
        <a
          className="bh-mobile-apps-link"
          href={COMMUNITY.discord}
          target="_blank"
          rel="noopener noreferrer"
        >
          <CommunityIcon name="discord" size={16} />
          <span>{t('mobileApps.discord')}</span>
          <ChannelSidebarIcon name="external-link" size={14} />
        </a>
        <div className="bh-mobile-apps-link" data-community="qq">
          <CommunityIcon name="qq" size={16} />
          <span>{t('mobileApps.qq', { number: COMMUNITY.qqGroup })}</span>
          <Button
            variant="outline"
            size="sm"
            icon={<ChannelSidebarIcon name={copied ? 'check' : 'copy'} size={14} />}
            onClick={() =>
              void navigator.clipboard
                ?.writeText(COMMUNITY.qqGroup)
                .then(() => setCopied(true))
                .catch(() => {})
            }
          >
            {t(copied ? 'mobileApps.copied' : 'mobileApps.copy')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
