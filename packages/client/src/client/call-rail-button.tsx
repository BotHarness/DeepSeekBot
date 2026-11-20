import { shallowEqual } from '@deepseek-ai/dsh-client-store';
import { useSyncExternalStore, type ReactElement } from 'react';

import { PersonaBotAvatar } from './avatar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { desktopCall, type DesktopCall } from './desktop-call.js';
import { Tooltip } from './ds/tooltip.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ClientState } from './store.js';
import { useClientStore } from './use-client-store.js';

interface CallBot {
  readonly displayName: string;
  readonly avatar: BotSummary['avatar'] | undefined;
  readonly appearance: BotSummary['appearance'] | undefined;
  readonly avatarSeed: BotSummary['avatarSeed'] | undefined;
}

function callBot(state: ClientState, slug: string | undefined): CallBot | undefined {
  const bot = slug === undefined ? undefined : state.bots.find((entry) => entry.slug === slug);
  return bot === undefined
    ? undefined
    : {
        displayName: bot.displayName,
        avatar: bot.avatar,
        appearance: bot.appearance,
        avatarSeed: bot.avatarSeed,
      };
}

const sameCallBot = (a: CallBot | undefined, b: CallBot | undefined): boolean =>
  a === undefined || b === undefined ? a === b : shallowEqual(a, b);

export function CallRailButton({
  t,
  onReturn,
  call = desktopCall(),
}: {
  t: BotHarnessTranslate;
  onReturn?: (() => void) | undefined;
  call?: DesktopCall;
}): ReactElement | null {
  const snapshot = useSyncExternalStore(call.subscribe, call.snapshot, call.snapshot);
  const status = snapshot.state.status;
  const slug = status === 'opening' || status === 'live' ? snapshot.slug : undefined;
  const bot = useClientStore((state) => callBot(state, slug), sameCallBot);
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
          onClick={() => {
            snapshot.place?.open();
            onReturn?.();
          }}
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
