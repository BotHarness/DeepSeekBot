import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import { useRef, useState, type ReactElement } from 'react';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  MessagingDefaults,
  MessagingDefaultsInput,
} from '../../../core/src/messaging/defaults.js';
import type { HumanNameSettingsProps } from './human-name-settings.js';
import { loadMessagingDefaults, saveMessagingDefaults } from './bridge.js';
import { Note } from './ds/note.js';
import { NumberStepper } from './ds/number-stepper.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { useMountedResource } from './mounted-resource.js';

type Platform = MessagingDefaultsInput['platform'];

const PLATFORMS: readonly { value: Platform; label: string }[] = [
  { value: 'feishu', label: 'Lark / 飞书' },
  { value: 'slack', label: 'Slack' },
  { value: 'discord', label: 'Discord' },
  { value: 'weixin', label: 'WeChat / 微信' },
];

const WAKE_MODES = ['digest', 'immediate', 'mentions', 'silent'] as const;

type Props = Pick<HumanNameSettingsProps, 'call' | 't'>;

export function MessagingDefaultsSettings({ call, t }: Props): ReactElement {
  const [platform, setPlatform] = useState<Platform>('feishu');
  return (
    <SettingsSection title={t('defaults.title')} description={t('defaults.lead')}>
      <SettingsRow
        title={t('identity.platform')}
        control={
          <Select
            label={t('defaults.platform')}
            value={platform}
            options={PLATFORMS}
            onChange={setPlatform}
          />
        }
      >
        {platform === 'weixin' ? <Note>{t('defaults.weixinNote')}</Note> : null}
      </SettingsRow>
      <PlatformDefaultsSettings key={platform} call={call} t={t} platform={platform} />
    </SettingsSection>
  );
}

function PlatformDefaultsSettings({
  call,
  t,
  platform,
}: Props & { platform: Platform }): ReactElement {
  const [draft, setDraft] = useState<MessagingDefaults>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const pending = useRef(false);
  const queued = useRef<Partial<MessagingDefaults> | undefined>(undefined);
  const request = useRef(0);
  const refresh = async (): Promise<void> => {
    const sequence = ++request.current;
    const value = await loadMessagingDefaults(call, platform);
    if (!mounted.current || sequence !== request.current) return;
    setDraft(value);
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    const reload = (): void => {
      if (!pending.current)
        void refresh().catch(() => {
          if (mounted.current) setError(t('defaults.failed'));
        });
    };
    reload();
    const unsubscribeDefaults = subscribeMessagingDefaults(reload);
    return () => {
      mounted.current = false;
      ++request.current;
      unsubscribeDefaults();
    };
  }, [call, platform]);
  const save = async (next: MessagingDefaults): Promise<void> => {
    pending.current = true;
    setBusy(true);
    setError('');
    ++request.current;
    try {
      const input: MessagingDefaultsInput = {
        platform,
        expectedRevision: next.revision,
        collection: next.collection,
        wake: next.wake,
        count: next.count,
        intervalSeconds: next.intervalSeconds,
        identityEnabled: next.identityEnabled,
        ...(platform === 'weixin' ? { typingEnabled: next.typingEnabled ?? true } : {}),
        newConversations: next.newConversations ?? 'auto',
      };
      const value = await saveMessagingDefaults(call, input);
      if (!mounted.current) return;
      const follow = queued.current;
      queued.current = undefined;
      if (follow === undefined) setDraft(value);
      else {
        const merged = { ...value, ...follow };
        setDraft(merged);
        await save(merged);
      }
    } catch (err) {
      queued.current = undefined;
      if (!mounted.current) return;
      setError(
        t(
          err instanceof Error && 'code' in err && err.code === 'defaults-stale'
            ? 'defaults.stale'
            : 'defaults.failed',
        ),
      );
      await refresh().catch(() => undefined);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const apply = (patch: Partial<MessagingDefaults>): void => {
    if (draft === undefined) return;
    if (pending.current) {
      queued.current = { ...queued.current, ...patch };
      setDraft({ ...draft, ...patch });
      return;
    }
    const next = { ...draft, ...patch };
    setDraft(next);
    void save(next);
  };
  if (draft === undefined)
    return (
      <div ref={mount}>
        {error ? <Note tone="danger">{error}</Note> : <Note>{t('im.loading')}</Note>}
      </div>
    );
  const weixin = platform === 'weixin';
  return (
    <div ref={mount} aria-busy={busy}>
      {weixin ? null : (
        <>
          <SettingsRow
            title={t('bridge.condition')}
            description={t('defaults.collectionHint')}
            control={
              <Select
                label={t('defaults.collection')}
                value={draft.collection}
                options={[
                  { value: 'mentions', label: t('bridge.mentions') },
                  { value: 'all', label: t('bridge.all') },
                ]}
                onChange={(collection) => apply({ collection })}
              />
            }
          />
          <SettingsRow
            title={t('im.ordinaryWake')}
            control={
              <Select
                label={t('defaults.wake')}
                value={draft.wake}
                options={WAKE_MODES.map((mode) => ({ value: mode, label: t(`im.wake.${mode}`) }))}
                onChange={(wake) => apply({ wake })}
              />
            }
          />
          {draft.wake === 'digest' ? (
            <SettingsRow
              title={t('defaults.threshold')}
              description={t('defaults.thresholdHint')}
              control={
                <>
                  <NumberStepper
                    label={t('defaults.count')}
                    value={draft.count}
                    min={1}
                    max={100}
                    unit={t('defaults.countUnit')}
                    decreaseLabel={t('common.decrease')}
                    increaseLabel={t('common.increase')}
                    onChange={(count) => apply({ count })}
                  />
                  <NumberStepper
                    label={t('defaults.seconds')}
                    value={draft.intervalSeconds}
                    min={1}
                    max={86400}
                    unit={t('defaults.secondsUnit')}
                    decreaseLabel={t('common.decrease')}
                    increaseLabel={t('common.increase')}
                    onChange={(intervalSeconds) => apply({ intervalSeconds })}
                  />
                </>
              }
            />
          ) : null}
        </>
      )}
      <SettingsRow
        title={t('defaults.identityRow')}
        description={t('defaults.enableIdentity')}
        control={
          <Switch
            checked={draft.identityEnabled}
            label={t('defaults.enableIdentity')}
            onChange={(identityEnabled) => apply({ identityEnabled })}
          />
        }
      />
      {weixin ? (
        <SettingsRow
          title={t('identity.typing.label')}
          description={t('defaults.enableTyping')}
          control={
            <Switch
              checked={draft.typingEnabled ?? true}
              label={t('defaults.enableTyping')}
              onChange={(typingEnabled) => apply({ typingEnabled })}
            />
          }
        />
      ) : (
        <SettingsRow
          title={t('identity.newConversations')}
          description={t('defaults.newConversationsHint')}
          control={
            <Select
              label={t('identity.newConversations')}
              value={draft.newConversations ?? 'auto'}
              options={[
                { value: 'auto', label: t('identity.newConversations.auto') },
                { value: 'ask', label: t('identity.newConversations.ask') },
              ]}
              onChange={(newConversations) => apply({ newConversations })}
            />
          }
        />
      )}
      {error ? <Note tone="danger">{error}</Note> : null}
    </div>
  );
}
