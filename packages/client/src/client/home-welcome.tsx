import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip } from './ds/tooltip.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { store } from './store.js';
import { PersonaBotAvatar } from './avatar.js';
import { useMountedResource } from './mounted-resource.js';
import { color, space, text } from './ds/tokens.stylex.js';
import { sameBotFace, useClientStore, type BotFace } from './use-client-store.js';

const styles = stylex.create({
  welcome: { display: 'flex', alignItems: 'center', gap: space.x4, minWidth: 0 },
  heading: {
    margin: 0,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  name: { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
});

export function HomeWelcome({
  actions,
  botSlug,
  t,
  onEditHumanName,
}: {
  actions: BridgeActions;
  botSlug?: string | undefined;
  t: BotHarnessTranslate;
  onEditHumanName(): void;
}): ReactElement {
  const bot = useClientStore(
    (state): BotFace | undefined => state.bots.find((item) => item.slug === botSlug),
    sameBotFace,
  );
  const [name, setName] = useState<string | null>(null);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    let version = 0;
    const refresh = async () => {
      const request = ++version;
      try {
        const identity = await actions.humanIdentity(controller.signal);
        if (!controller.signal.aborted && request === version) setName(identity.defaultDisplayName);
      } catch {}
    };
    let channels = store.getSnapshot().channels;
    const unsubscribe = store.subscribe(() => {
      if (channels === store.getSnapshot().channels) return;
      channels = store.getSnapshot().channels;
      void refresh();
    });
    void refresh();
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [actions]);
  return (
    <div ref={mount} {...stylex.props(styles.welcome)} data-home-welcome>
      {bot && (
        <PersonaBotAvatar
          personaBotId={bot.slug}
          name={bot.displayName}
          src={bot.avatar}
          appearance={bot.appearance}
          avatarSeed={bot.avatarSeed}
          size={40}
          indicator={false}
          t={t}
        />
      )}
      <h2 {...stylex.props(styles.heading)}>
        {t('home.humanGreeting')}
        <Tooltip label={t('home.editHumanName')} side="bottom" portal>
          <Button
            variant="ghost"
            style={{ paddingInline: space.x1 }}
            onClick={onEditHumanName}
            aria-label={t('home.editHumanName')}
          >
            <span {...stylex.props(styles.name)}>{name ?? t('home.defaultHumanName')}</span>
          </Button>
        </Tooltip>
      </h2>
    </div>
  );
}
