import { useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { Note } from './ds/note.js';
import { FieldStack, TextField } from './ds/field.js';

export function PrivateRelaySettings({
  t,
  status,
  refresh,
  pair,
}: PropsLocale<'botharness'> & {
  status?: { state: string; origin?: string; issue?: string };
  refresh(): Promise<unknown>;
  pair(): void;
}): ReactElement {
  const [origin, setOrigin] = useState('');
  const [bootstrap, setBootstrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function claim() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch('./api/botharness/devices/private', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, bootstrap, confirm: true }),
      });
      if (!response.ok) {
        setFailed(true);
        return;
      }
      setBootstrap('');
      await refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Note>{t('privateRelay.requirement')}</Note>
      <Note>{t('privateRelay.deploy')}</Note>
      {status && status.state !== 'off' ? (
        <>
          <Note>{status.origin}</Note>
          <Note tone={status.state === 'error' ? 'danger' : 'muted'}>
            {t(
              status.state === 'connected'
                ? 'privateRelay.connected'
                : status.state === 'error'
                  ? 'privateRelay.failed'
                  : 'privateRelay.connecting',
            )}
          </Note>
          <Button variant="primary" disabled={status.state !== 'connected'} onClick={pair}>
            {t('privateRelay.pair')}
          </Button>
        </>
      ) : (
        <>
          <FieldStack>
            <TextField
              label={t('privateRelay.address')}
              value={origin}
              onChange={setOrigin}
              autoComplete="off"
            />
            <TextField
              label={t('privateRelay.secret')}
              value={bootstrap}
              onChange={setBootstrap}
              type="password"
              autoComplete="off"
            />
          </FieldStack>
          {failed ? <Note tone="danger">{t('privateRelay.failed')}</Note> : null}
          <Button
            variant="primary"
            disabled={busy || !origin.trim() || !bootstrap.trim()}
            onClick={() => void claim()}
          >
            {t(busy ? 'privateRelay.connecting' : 'privateRelay.claim')}
          </Button>
        </>
      )}
    </>
  );
}
