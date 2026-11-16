import { useRef, useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import { FormDialog } from './ds/form-dialog.js';
import { hostSettingsDrafts, type HostDraftChoice } from './host-settings-drafts.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

export type HostDraftLeaveReason = 'switch' | 'leave';

export interface HostDraftGuard {
  readonly leave: (next: () => void, reason?: HostDraftLeaveReason) => Promise<void>;
  readonly view: ReactElement;
}

export function useHostDraftGuard(
  hostId: string | undefined,
  t: BotHarnessTranslate,
): HostDraftGuard {
  const leaving = useRef(false);
  const leaveReason = useRef<HostDraftLeaveReason>('leave');
  const [draftPrompt, setDraftPrompt] = useState(false);
  const choice = useRef<(value: HostDraftChoice) => void>();
  const settle = (value: HostDraftChoice) => {
    const resolve = choice.current;
    choice.current = undefined;
    setDraftPrompt(false);
    resolve?.(value);
  };
  const mount = useMountedResource<HTMLSpanElement>(() => {
    if (hostId === undefined) return;
    const release = hostSettingsDrafts.prompt(
      hostId,
      () =>
        new Promise((resolve) => {
          choice.current = resolve;
          setDraftPrompt(true);
        }),
    );
    return () => {
      release();
      choice.current?.('cancel');
      choice.current = undefined;
      setDraftPrompt(false);
    };
  }, [hostId]);
  const leave = async (next: () => void, reason: HostDraftLeaveReason = 'leave') => {
    if (hostId === undefined) {
      next();
      return;
    }
    if (leaving.current) return;
    leaving.current = true;
    leaveReason.current = reason;
    try {
      if (await hostSettingsDrafts.prepare(hostId)) next();
    } finally {
      leaving.current = false;
      leaveReason.current = 'leave';
    }
  };
  const view = (
    <>
      <span ref={mount} hidden />
      {draftPrompt ? (
        <FormDialog
          title={t('relationships.unsaved')}
          description={t('relationships.unsavedHint')}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          submitLabel={t(
            leaveReason.current === 'switch'
              ? 'environment.settings.saveAndSwitch'
              : 'relationships.save',
          )}
          onCancel={() => settle('cancel')}
          onSubmit={() => settle('save')}
          secondary={
            <Button variant="outline" onClick={() => settle('discard')}>
              {t('relationships.discard')}
            </Button>
          }
        />
      ) : null}
    </>
  );
  return { leave, view };
}
