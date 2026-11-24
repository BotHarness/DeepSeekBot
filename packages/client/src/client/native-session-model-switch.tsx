import type { Context } from '@deepseek-ai/cordis';
import type { ChatNode, ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { ConversationNodeDefinitionInput } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { TurnModelSwitch } from '@botharness/host-protocol/turn-target';

import {
  isDshModelSwitchEvent,
  projectDshModelSwitch,
  type DshModelSwitchProjection,
} from '@botharness/host-protocol/dsh-model-switch';
import type { BridgeActions } from './actions.js';
import { LOCALE_NS, type BotHarnessTranslate } from './locale.js';
import { SessionModelSwitch } from './session-model-switch.js';
import { useTurnTargetModels } from './turn-target-label.js';

const KIND = 'botharness-model-switch';

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    [KIND]: TurnModelSwitch;
  }
}

export const nativeModelSwitchDefinition: ConversationNodeDefinitionInput<DshModelSwitchProjection> =
  {
    kind: KIND,
    target: 'chat',
    match: (event) =>
      isDshModelSwitchEvent(event) ? { id: String(event.seq), role: 'start' } : null,
    start: (_context, { event }, reader) =>
      projectDshModelSwitch(reader.previous<DshModelSwitchProjection>(KIND)?.state, event),
    update: (context) => context.state,
    buildViewNode: ({ key, id, start, state }): ChatNode<typeof KIND> | null => {
      if (start === undefined || state?.marker === undefined) return null;
      return {
        key,
        id,
        kind: KIND,
        target: 'chat',
        anchorSeq: start.event.seq,
        location: start.location,
        visibility: 'visible',
        groupTree: 'turn',
        data: state.marker,
      };
    },
  };

export function registerNativeSessionModelSwitch(ctx: Context, actions: BridgeActions): void {
  ctx.effect(
    () => ctx.uiConversation.events.register(nativeModelSwitchDefinition),
    'botharness: native Session model switch projection',
  );
  ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register(
      { name: 'conversation.chat.node', key: KIND, locale: LOCALE_NS },
      function NativeModelSwitch({
        node,
        t,
      }: Pick<ChatNodeViewProps<typeof KIND>, 'node'> & {
        t: BotHarnessTranslate;
      }) {
        const { models, mount } = useTurnTargetModels(actions, true, 'cached');
        return (
          <div ref={mount}>
            <SessionModelSwitch item={node.data} catalog={{ models }} native t={t} />
          </div>
        );
      },
    ),
  );
}
