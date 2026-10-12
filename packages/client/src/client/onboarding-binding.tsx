import { useState, useSyncExternalStore, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import { ExternalIdentityList } from './external-identity-list.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMessagingSnapshot } from './messaging-store.js';
import { onboardingFor } from './onboarding.js';
import { useMountedResource } from './mounted-resource.js';
import { store } from './store.js';

function BindingDialog({
  slug,
  actions,
  t,
  onClose,
}: {
  slug: string;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose(): void;
}): ReactElement {
  const { snapshot, refresh, mount } = useMessagingSnapshot(slug, actions);
  const client = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const dm = client.channels.find((channel) => channel.type === 'dm' && channel.botSlug === slug);
  const botName = (owner: string): string =>
    client.bots.find((bot) => bot.slug === owner)?.displayName ?? owner;
  return (
    <div ref={mount}>
      <ExternalIdentityList
        appSetup={actions.appSetup ? { client: actions.appSetup, botSlug: slug } : undefined}
        snapshot={snapshot}
        refresh={refresh}
        t={t}
        bindDialog={{
          onClose,
          dismissLabel: t('onboarding.binding.notNow'),
          description: t('onboarding.binding.description'),
        }}
        mutate={async (input) => {
          await actions.messagingIdentity(slug, input);
          await refresh();
        }}
        conversation={async (input) => {
          await actions.messagingConversation(slug, input);
          await refresh();
        }}
        rules={async (grantId, input) => {
          await actions.messagingGroupPolicy(slug, grantId, input);
          await refresh();
        }}
        channels={[
          ...(dm ? [{ id: dm.id, name: t('bridge.dmTarget', { name: botName(slug) }) }] : []),
          ...(snapshot?.channelTargets ?? []),
        ]}
        botName={botName}
      />
    </div>
  );
}

export function OnboardingAppBinding({
  actions,
  channelId,
  t,
}: {
  actions: BridgeActions;
  channelId: string;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const controller = onboardingFor(actions);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const client = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [open, setOpen] = useState(false);
  const channel = client.conversation.channel;
  const experienceMount = useMountedResource<HTMLSpanElement>(() => {
    if (controller.consumeExperience('im')) setOpen(true);
  }, [state.experience]);
  if (
    !state.receipt?.completed ||
    channel?.id !== channelId ||
    channel.type !== 'dm' ||
    !channel.botSlug ||
    !client.bots.some((bot) => bot.slug === channel.botSlug && !bot.paused && !bot.deleted)
  )
    return null;
  return (
    <>
      <span ref={experienceMount} hidden />
      <Button
        variant="outline"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          controller.pauseGuide();
          setOpen(true);
        }}
      >
        {t('identity.bind')}
      </Button>
      {open ? (
        <BindingDialog
          key={channel.botSlug}
          slug={channel.botSlug}
          actions={actions}
          t={t}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
