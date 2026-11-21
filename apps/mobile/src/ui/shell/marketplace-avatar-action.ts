import { useRef, useState } from 'react';
import { MethodRefused } from '@botharness/host-client/client';
import { useStrings } from '../strings';
import { avatarFailureMessage } from './marketplace-avatar-parts';

export function useAvatarAction() {
  const copy = useStrings().marketplaceAvatars;
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (action: () => Promise<void>, failure: (cause: unknown) => string) => {
    if (lock.current) return;
    lock.current = true;
    setError(undefined);
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof MethodRefused ? avatarFailureMessage(cause.code, copy) : failure(cause),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run };
}
