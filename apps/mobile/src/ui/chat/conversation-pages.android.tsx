import type { ComponentProps } from 'react';
import { ConversationScreen } from './conversation-screen';
import { PredictivePage } from '../shell/predictive-page';

export function ConversationPages(props: ComponentProps<typeof ConversationScreen>) {
  return (
    <PredictivePage>
      <ConversationScreen {...props} />
    </PredictivePage>
  );
}
