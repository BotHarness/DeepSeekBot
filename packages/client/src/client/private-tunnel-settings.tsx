import { useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { ChoiceButton } from './ds/choice-button.js';
import { FieldStack, TextField } from './ds/field.js';
import { Note } from './ds/note.js';

export interface PrivateTunnelView {
  state: 'off' | 'starting' | 'verifying' | 'connected' | 'error';
  mode?: 'quick' | 'named';
  origin?: string;
  originPort?: number;
  issue?: string;
  probe?: string;
  addressChanged?: boolean;
}

type Step = 'choose' | 'named';

// The no-Docker private route: this computer runs cloudflared and publishes only its encrypted phone channel.
export function PrivateTunnelSettings({
  t,
  status,
  refresh,
  pair,
  advanced,
}: PropsLocale<'botharness'> & {
  status?: PrivateTunnelView;
  refresh(): Promise<unknown>;
  pair(): void;
  advanced(): void;
}): ReactElement {
  const [step, setStep] = useState<Step>('choose');
  const [hostname, setHostname] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  async function send(body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setFailure(undefined);
    try {
      const response = await fetch('./api/botharness/devices/private-tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, confirm: true }),
      });
      const result = (await response.json().catch(() => ({}))) as { code?: string };
      if (!response.ok) {
        setFailure(result.code ?? 'private-tunnel-failed');
        return;
      }
      setToken('');
      setStep('choose');
      await refresh();
    } catch {
      setFailure('private-tunnel-failed');
    } finally {
      setBusy(false);
    }
  }
  const failed = failure ? (
    <Note tone="danger">{t('privateTunnel.refused', { code: failure })}</Note>
  ) : null;

  if (status && status.state !== 'off') {
    const state =
      status.state === 'connected'
        ? t('privateTunnel.connected')
        : status.state === 'error'
          ? t('privateTunnel.error', { issue: status.issue ?? 'unknown' })
          : status.state === 'verifying'
            ? t('privateTunnel.verifying')
            : t('privateTunnel.starting');
    return (
      <>
        <Note>
          {t(status.mode === 'named' ? 'privateTunnel.namedTitle' : 'privateTunnel.quickTitle')}
          {status.origin ? ` · ${status.origin}` : ''}
        </Note>
        <Note
          tone={
            status.state === 'connected' ? 'success' : status.state === 'error' ? 'danger' : 'muted'
          }
        >
          {state}
          {status.probe && status.state !== 'connected'
            ? ` ${t('privateTunnel.probe', { probe: status.probe })}`
            : ''}
        </Note>
        {status.mode === 'named' && status.state !== 'connected' && status.originPort ? (
          <Note>{t('privateTunnel.namedService', { port: String(status.originPort) })}</Note>
        ) : null}
        {status.addressChanged ? (
          <Note tone="warning">{t('privateTunnel.addressChanged')}</Note>
        ) : null}
        {failed}
        <Button variant="primary" disabled={status.state !== 'connected'} onClick={pair}>
          {t('privateRelay.pair')}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void send({ action: 'disable' })}>
          {t('privateTunnel.disable')}
        </Button>
      </>
    );
  }

  if (step === 'named')
    return (
      <>
        <Note>{t('privateTunnel.namedHelp')}</Note>
        <FieldStack>
          <TextField
            label={t('privateTunnel.hostname')}
            value={hostname}
            onChange={setHostname}
            autoComplete="off"
          />
          <TextField
            label={t('privateTunnel.token')}
            value={token}
            onChange={setToken}
            type="password"
            autoComplete="off"
          />
        </FieldStack>
        {failed}
        <Button
          variant="primary"
          disabled={busy || !hostname.trim() || !token.trim()}
          onClick={() => void send({ action: 'enable', mode: 'named', hostname, token })}
        >
          {t(busy ? 'privateRelay.connecting' : 'privateTunnel.namedEnable')}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => setStep('choose')}>
          {t('privateTunnel.back')}
        </Button>
      </>
    );

  return (
    <>
      <Note>{t('privateTunnel.intro')}</Note>
      <ChoiceButton
        title={t('privateTunnel.quickTitle')}
        description={t('privateTunnel.quickDescription')}
        disabled={busy}
        onClick={() => void send({ action: 'enable', mode: 'quick' })}
      />
      <ChoiceButton
        title={t('privateTunnel.namedTitle')}
        description={t('privateTunnel.namedDescription')}
        disabled={busy}
        onClick={() => setStep('named')}
      />
      <ChoiceButton
        title={t('privateTunnel.advancedTitle')}
        description={t('privateTunnel.advancedDescription')}
        disabled={busy}
        onClick={advanced}
      />
      {failed}
    </>
  );
}
