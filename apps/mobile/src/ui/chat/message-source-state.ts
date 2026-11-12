import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ConversationMessage } from '../../host/conversation';

function retainedSource(messages: readonly ConversationMessage[], id: string) {
  return messages.find(
    (message) => message.id === id && message.source?.message.contentPurge === undefined,
  );
}

export function useMessageSourceState(
  scope: string,
  focused: boolean,
  messages: readonly ConversationMessage[],
) {
  const owner = useRef({ scope, focused, messages });
  owner.current = { scope, focused, messages };
  const [selection, setSelection] = useState<{ scope: string; id: string }>();
  const message =
    focused && selection?.scope === scope ? retainedSource(messages, selection.id) : undefined;
  useLayoutEffect(() => {
    if (selection !== undefined && (!focused || selection.scope !== scope || message === undefined))
      setSelection(undefined);
  }, [scope, focused, selection, message]);
  const select = useCallback(
    (value: ConversationMessage) => {
      const current = owner.current;
      if (
        !current.focused ||
        current.scope !== scope ||
        retainedSource(current.messages, value.id) === undefined
      )
        return;
      setSelection({ scope, id: value.id });
    },
    [scope],
  );
  const close = useCallback(() => setSelection(undefined), []);
  return { message, select, close };
}
