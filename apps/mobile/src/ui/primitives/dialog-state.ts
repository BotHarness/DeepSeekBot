export type DialogAction = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  icon?: 'person' | 'chat' | 'settings' | 'close' | 'computer';
  onPress?: () => unknown;
};

export type DialogState = {
  id: number;
  title: string;
  message: string | undefined;
  actions: readonly DialogAction[];
  busy: number | undefined;
  error: string | undefined;
};

export function createDialogState() {
  let current: DialogState | undefined;
  let nextId = 0;
  const listeners = new Set<() => void>();
  const publish = (value: DialogState | undefined) => {
    current = value;
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => current,
    open(title: string, message: string | undefined, actions: readonly DialogAction[]) {
      publish({ id: ++nextId, title, message, actions, busy: undefined, error: undefined });
    },
    dismiss() {
      if (current?.busy === undefined) publish(undefined);
    },
    async choose(index: number, requestId: number) {
      const shown = current;
      const action = shown?.actions[index];
      if (!shown || shown.id !== requestId || !action || shown.busy !== undefined) return;
      if (action.style === 'cancel') {
        publish(undefined);
        return;
      }
      publish({ ...shown, busy: index, error: undefined });
      try {
        const accepted = await action.onPress?.();
        if (current?.id === shown.id && accepted === false) {
          publish({ ...shown, busy: undefined, error: '' });
          return;
        }
        if (current?.id === shown.id) publish(undefined);
      } catch (failure) {
        if (current?.id === shown.id)
          publish({
            ...shown,
            busy: undefined,
            error: failure instanceof Error ? failure.message : String(failure),
          });
      }
    },
  };
}

export const appDialogs = createDialogState();
