import { useCallback, useState } from 'react';

export type SubmissionState = 'idle' | 'busy' | 'failed';

export function useSubmission(): {
  state: SubmissionState;
  run: (action: () => Promise<boolean>) => Promise<boolean>;
} {
  const [state, setState] = useState<SubmissionState>('idle');
  const run = useCallback(async (action: () => Promise<boolean>): Promise<boolean> => {
    setState('busy');
    let ok = false;
    try {
      ok = await action();
    } catch {
      ok = false;
    }
    setState(ok ? 'idle' : 'failed');
    return ok;
  }, []);
  return { state, run };
}
