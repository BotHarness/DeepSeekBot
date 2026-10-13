import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { Combobox } from './combobox.js';
import { Field, TextField } from './ds/field.js';
import { FormDialog, type DialogLabels } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { color, space } from './ds/tokens.stylex.js';
import { useMountedResource } from './mounted-resource.js';
import {
  ProviderAppSetup,
  type AppSetupAttempt,
  type AppSetupDescriptor,
} from './provider-app-setup.js';
import type { BotHarnessTranslate } from './locale.js';

const VERIFY_CODE = /^[0-9]{4,8}$/;

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    minWidth: 0,
  },
  link: {
    alignSelf: 'flex-start',
    color: color.accent,
    textUnderlineOffset: '3px',
  },
  qr: {
    display: 'block',
    alignSelf: 'center',
    width: '320px',
    maxWidth: '100%',
    height: 'auto',
  },
  cancel: { alignSelf: 'flex-start' },
});

export function CreateAppForm({
  client,
  botSlug,
  descriptors,
  t,
  title,
  description,
  labels,
  error: failure,
  onCancel,
  onCreated,
  onBack,
}: {
  client: ProviderAppSetup;
  botSlug: string;
  descriptors: AppSetupDescriptor[];
  t: BotHarnessTranslate;
  title: string;
  description?: string | undefined;
  labels: DialogLabels;
  error?: ReactNode;
  onCancel(): void;
  onCreated(): Promise<void>;
  onBack(): void;
}): ReactElement {
  const [platform, setPlatform] = useState(
    client.descriptor(botSlug)?.platform ?? descriptors[0]?.platform ?? 'feishu',
  );
  const [domain, setDomain] = useState<'feishu' | 'lark'>('lark');
  const [attempt, setAttempt] = useState<AppSetupAttempt | undefined>(client.current(botSlug));
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef(false);
  const requestEpoch = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reset = () => {
    setAppId('');
    setAppSecret('');
    setVerifyCode('');
  };
  const keepPolling = (value: AppSetupAttempt) => {
    clearTimeout(pollTimer.current);
    if (
      value.platform !== 'weixin' ||
      !['pending', 'scanned', 'needs_verification', 'connecting'].includes(value.state)
    )
      return;
    const epoch = requestEpoch.current;
    pollTimer.current = setTimeout(() => {
      if (!active.current || epoch !== requestEpoch.current) return;
      void client
        .poll(botSlug)
        .then(async (next) => {
          if (!active.current || epoch !== requestEpoch.current) return;
          setAttempt(next);
          if (next.state === 'ready') {
            setBusy(true);
            await onCreated();
          } else keepPolling(next);
        })
        .catch(() => {
          if (active.current && epoch === requestEpoch.current) {
            setError(true);
            if (!client.current(botSlug)) setAttempt(undefined);
          }
        })
        .finally(() => {
          if (active.current && epoch === requestEpoch.current) setBusy(false);
        });
    }, 1000);
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    active.current = true;
    const epoch = requestEpoch.current;
    if (client.current(botSlug)) {
      setBusy(true);
      void client
        .poll(botSlug)
        .then((value) => {
          if (active.current && epoch === requestEpoch.current) {
            setAttempt(value);
            keepPolling(value);
          }
        })
        .catch(() => {
          if (active.current && epoch === requestEpoch.current) {
            setError(true);
            if (!client.current(botSlug)) setAttempt(undefined);
          }
        })
        .finally(() => {
          if (active.current && epoch === requestEpoch.current) setBusy(false);
        });
    }
    return () => {
      active.current = false;
      clearTimeout(pollTimer.current);
    };
  }, []);
  const create = async () => {
    if (busy) return;
    const data = { appId, appSecret, verifyCode };
    const epoch = ++requestEpoch.current;
    clearTimeout(pollTimer.current);
    setBusy(true);
    setError(false);
    try {
      const descriptor = descriptors.find((entry) => entry.platform === platform);
      if (!descriptor) throw new Error('setup-unavailable');
      let value = client.current(botSlug)
        ? await client.poll(botSlug)
        : await client.start(botSlug, descriptor);
      if (value.state === 'credentials') {
        value = await client.credentials(botSlug, {
          appId: data.appId.trim(),
          appSecret: data.appSecret.trim(),
          domain,
        });
        reset();
      }
      if (value.state === 'needs_verification' && data.verifyCode) {
        value = await client.verify(botSlug, data.verifyCode.trim());
        reset();
      }
      if (active.current && epoch === requestEpoch.current) {
        keepPolling(value);
        setAttempt(value);
        if (value.state === 'ready') await onCreated();
      }
    } catch {
      if (active.current && epoch === requestEpoch.current) setError(true);
    } finally {
      if (active.current && epoch === requestEpoch.current) setBusy(false);
    }
  };
  const cancelSetup = () => {
    requestEpoch.current++;
    clearTimeout(pollTimer.current);
    void client
      .cancel(botSlug)
      .then((value) => {
        if (value.state !== 'ready') client.forget(botSlug);
        if (active.current) {
          setAttempt(value.state === 'ready' ? value : undefined);
          setError(false);
        }
      })
      .catch(() => {
        if (active.current) {
          setError(true);
          if (!client.current(botSlug)) setAttempt(undefined);
        }
      })
      .finally(() => {
        if (active.current) setBusy(false);
      });
  };
  const verifying = platform === 'weixin' && attempt?.state === 'needs_verification';
  return (
    <FormDialog
      title={title}
      description={description}
      labels={labels}
      submitLabel={t(
        busy
          ? 'identity.pending'
          : platform === 'weixin' && !attempt
            ? 'appSetup.startQr'
            : attempt?.state === 'needs_verification'
              ? 'appSetup.verify'
              : 'appSetup.createBind',
      )}
      busy={busy}
      submitDisabled={verifying && !VERIFY_CODE.test(verifyCode)}
      onCancel={onCancel}
      onSubmit={() => void create()}
      error={error ? t('appSetup.failed') : failure}
      secondary={
        <Button type="button" variant="ghost" disabled={busy} onClick={onBack}>
          {t('appSetup.back')}
        </Button>
      }
    >
      <div ref={mount} {...stylex.props(styles.stack)}>
        <Field label={t('appSetup.platform')} hint={t('appSetup.resumeHint')} group>
          {() => (
            <Combobox
              label={t('appSetup.platform')}
              toggleLabel={t('appSetup.platform')}
              value={platform}
              disabled={busy || !!attempt}
              onSelect={(value) => setPlatform(value as 'feishu' | 'weixin')}
              options={descriptors.map((entry) => ({
                value: entry.platform,
                label: entry.platform === 'feishu' ? 'Lark / 飞书' : t('appSetup.wechat'),
              }))}
              emptyLabel={t('identity.noApps')}
            />
          )}
        </Field>
        {platform === 'feishu' && attempt?.state !== 'ready' ? (
          <>
            <Field label={t('appSetup.domain')} group>
              {() => (
                <Combobox
                  label={t('appSetup.domain')}
                  toggleLabel={t('appSetup.domain')}
                  value={domain}
                  disabled={busy}
                  onSelect={(value) => setDomain(value as 'feishu' | 'lark')}
                  options={[
                    { value: 'lark', label: 'Lark' },
                    { value: 'feishu', label: '飞书' },
                  ]}
                  emptyLabel={t('im.select')}
                />
              )}
            </Field>
            <TextField
              label="App ID"
              name="appId"
              value={appId}
              onChange={setAppId}
              disabled={busy}
              autoComplete="off"
            />
            <TextField
              label="App Secret"
              name="appSecret"
              type="password"
              value={appSecret}
              onChange={setAppSecret}
              disabled={busy}
              autoComplete="off"
            />
            <a
              href={t('identity.tutorial.larkUrl')}
              target="_blank"
              rel="noopener noreferrer"
              {...stylex.props(styles.link)}
            >
              {t('appSetup.checklist')}
            </a>
          </>
        ) : null}
        {platform === 'weixin' && attempt && attempt.state !== 'ready' ? (
          <>
            <Note>
              {t(
                `appSetup.qr.${attempt.state === 'creating' || attempt.state === 'credentials' ? 'pending' : attempt.state}`,
              )}
            </Note>
            {attempt.qrDataUrl ? (
              <img
                src={attempt.qrDataUrl}
                alt={t('appSetup.qrAlt')}
                width={320}
                height={320}
                {...stylex.props(styles.qr)}
              />
            ) : null}
            {attempt.state === 'needs_verification' ? (
              <TextField
                label={t('appSetup.verifyCode')}
                name="verifyCode"
                value={verifyCode}
                onChange={setVerifyCode}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{4,8}"
                maxLength={8}
                required
                disabled={busy}
                initialFocus
              />
            ) : null}
          </>
        ) : null}
        {attempt?.state === 'ready' ? (
          <Note tone="success">
            {t('appSetup.created', {
              name: attempt.name ?? attempt.accountRef ?? '',
            })}
          </Note>
        ) : null}
        {attempt || busy ? (
          <Button
            type="button"
            variant="outline"
            className={stylex.props(styles.cancel).className ?? ''}
            onClick={cancelSetup}
          >
            {t('appSetup.cancel')}
          </Button>
        ) : null}
      </div>
    </FormDialog>
  );
}
