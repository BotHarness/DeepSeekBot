import { useSyncExternalStore, type ReactElement } from 'react';

import { PersonaBotAvatar } from './avatar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { desktopCall, type DesktopCall } from './desktop-call.js';
import { Tooltip } from './ds/tooltip.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ClientState } from './store.js';
import { useClientStore } from './use-client-store.js';

type CallBot = ClientState['bots'][number];

export function CallRailButton({
  t,
  call = desktopCall(),
}: {
  t: BotHarnessTranslate;
  call?: DesktopCall;
}): ReactElement | null {
  const snapshot = useSyncExternalStore(call.subscribe, call.snapshot, call.snapshot);
  const status = snapshot.state.status;
  const slug = status === 'opening' || status === 'live' ? snapshot.slug : undefined;
  const bot = useClientStore((state): CallBot | undefined =>
    slug === undefined ? undefined : state.bots.find((entry) => entry.slug === slug),
  );
  if (slug === undefined) return null;
  const name = bot?.displayName ?? slug;
  const label = t('call.return', { name });
  return (
    <span className="bh-call-rail">
      <Tooltip label={label} side="right" portal>
        <button
          type="button"
          className="bh-call-rail-button"
          aria-label={label}
          data-status={status}
          onClick={() => snapshot.place?.open()}
        >
          <PersonaBotAvatar
            t={t}
            personaBotId={slug}
            name={name}
            src={bot?.avatar}
            appearance={bot?.appearance}
            avatarSeed={bot?.avatarSeed}
            indicator={false}
            still
            nativeTitle={false}
            size={24}
          />
          <span className="bh-call-rail-badge" aria-hidden="true">
            <ChannelSidebarIcon name="phone" size={8} />
          </span>
        </button>
      </Tooltip>
    </span>
  );
}
