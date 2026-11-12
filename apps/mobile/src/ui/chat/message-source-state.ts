import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ConversationMessage } from '../../host/conversation';

export function useMessageSourceState(
  scope: string,
  focused: boolean,
  messages: readonly ConversationMessage[],
) {
  const owner = useRef({ scope, focused, messages });
  owner.current = { scope, focused, messages };
  const [selection, setSelection] = useState<{ scope: string; id: string }>();
  const message =
    focused && selection?.scope === scope
      ? messages.find((value) => value.id === selection.id)
      : undefined;
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
        !current.messages.some((message) => message.id === value.id)
      )
        return;
      setSelection({ scope, id: value.id });
    },
    [scope],
  );
  const close = useCallback(() => setSelection(undefined), []);
  return { message, select, close };
}
