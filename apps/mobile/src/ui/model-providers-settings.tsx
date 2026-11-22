import * as Clipboard from 'expo-clipboard';
import { useCallback, useState } from 'react';
import { Pressable, View, type ViewInstance } from 'react-native';

import type {
  ModelProviderView,
  ModelProvidersView,
} from '@botharness/host-client/model-providers';
import {
  maskEmail,
  quotaCountdown,
  quotaLevel,
  quotaLimited,
  quotaRemaining,
  quotaStale,
  shownQuotaWindows,
  type AccountQuota,
  type QuotaRefreshStatus,
  type SubscriptionAccountsView,
  type SubscriptionAccountView,
} from '@botharness/host-client/subscription-accounts';
import { modelBrand } from '@botharness/host-client/shared/model-brand';
import { EngineBrandIcon } from './chat/engine-brand-icon';
import { ModelBrandIcon } from './chat/model-brand-icon';
import { chart } from './design/chart';
import { radius, space } from './design/tokens';
import { useDesignTheme } from './design/theme';
import { useMounted } from './mounted';
import { Button } from './primitives/button';
import { SettingsForm, SettingsFormItem } from './primitives/settings-form';
import { SettingsFooter, SettingsRow, SettingsSection } from './primitives/settings-row';
import { Text } from './primitives/text';
import { LoadFailed, Loading, Notice, errorText } from './request-parts';
import { useStrings } from './strings';

export interface ModelProvidersPort {
  providers(): Promise<ModelProvidersView>;
  accounts(): Promise<SubscriptionAccountsView>;
  refresh(id: string): Promise<QuotaRefreshStatus>;
  signIn(id: string): Promise<{ url?: string }>;
  cancelSignIn(id: string): Promise<void>;
}

type RefreshState =
  | { state: 'idle' }
  | { state: 'refreshing' }
  | { state: 'failed'; reason: Exclude<QuotaRefreshStatus, 'ok'> };

const LEVEL_COLOR = { high: 'success', medium: 'warning', low: 'danger' } as const;

function shortTime(at: string): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function providerDetail(provider: ModelProviderView, t: ReturnType<typeof useStrings>): string {
  const copy = t.modelProviders;
  return [
    provider.keyStored && provider.keyLast4 !== undefined
      ? copy.keyLast4(provider.keyLast4)
      : copy.noKey,
    copy.models(provider.modelCount),
    copy.availability[provider.availability],
  ].join(' · ');
}

function accountTitle(account: SubscriptionAccountView): string {
  const brand = account.engine === 'codex' ? 'Codex' : 'Claude Code';
  return account.name === undefined || account.name === brand
    ? brand
    : `${brand} · ${account.name}`;
}

function quotaChip(
  quota: AccountQuota | undefined,
  now: number,
  t: ReturnType<typeof useStrings>,
): string {
  if (quotaLimited(quota, now)) return t.modelProviders.quotaExhausted;
  const remaining = quotaRemaining(quota, now);
  return remaining === undefined
    ? t.modelProviders.quotaView
    : t.modelProviders.quotaLeft(remaining);
}

function updatedText(observedAt: string, now: number, t: ReturnType<typeof useStrings>): string {
  const minutes = Math.floor((now - Date.parse(observedAt)) / 60_000);
  if (minutes < 1) return t.modelProviders.updatedNow;
  if (minutes < 60) return t.modelProviders.updatedMinutes(minutes);
  return t.modelProviders.updatedAt(shortTime(observedAt));
}

function countdownText(resetsAt: string, now: number, t: ReturnType<typeof useStrings>): string {
  const { days, hours, minutes } = quotaCountdown(resetsAt, now);
  const copy = t.modelProviders.resetsIn;
  if (days > 0) return copy.days(days, hours);
  if (hours > 0) return copy.hours(hours, minutes);
  return copy.minutes(minutes);
}

function QuotaWindows({ quota, now }: { quota: AccountQuota | undefined; now: number }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const windows = shownQuotaWindows(quota, now);
  if (windows.length === 0)
    return (
      <Text variant="meta" tone="muted">
        {t.modelProviders.quotaEmpty}
      </Text>
    );
  return (
    <View style={{ gap: space.x3 }}>
      {windows.map((window) => (
        <View
          key={window.id}
          testID={`quota-window-${window.id}`}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={
            window.id === 'session' ? t.modelProviders.sessionLeft : t.modelProviders.weeklyLeft
          }
          accessibilityValue={{
            min: 0,
            max: 100,
            now: window.remaining,
            text: t.modelProviders.quotaLeft(window.remaining),
          }}
          style={{ gap: space.x2 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x2 }}>
            <Text variant="body" strong style={{ fontVariant: ['tabular-nums'] }}>
              {`${window.remaining}%`}
            </Text>
            <Text variant="meta" tone="muted" style={{ flex: 1 }}>
              {window.id === 'session' ? t.modelProviders.sessionLeft : t.modelProviders.weeklyLeft}
            </Text>
            {window.resetsAt === undefined ? null : (
              <Text variant="meta" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
                {countdownText(window.resetsAt, now, t)}
              </Text>
            )}
          </View>
          <View
            style={{
              height: chart.bar,
              borderRadius: radius.round,
              overflow: 'hidden',
              backgroundColor: theme.layer.raised.inset,
            }}
          >
            <View
              style={{
                width: `${window.remaining}%`,
                height: '100%',
                borderRadius: radius.round,
                backgroundColor: theme.color[LEVEL_COLOR[quotaLevel(window.remaining)]],
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function AccountDetail({
  account,
  now,
  refresh,
  signInUrl,
  onRefresh,
  onSignIn,
  onCancelSignIn,
}: {
  account: SubscriptionAccountView;
  now: number;
  refresh: RefreshState;
  signInUrl: string | undefined;
  onRefresh(): void;
  onSignIn(): void;
  onCancelSignIn(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const signingIn = signInUrl !== undefined;
  return (
    <View style={{ gap: space.x4, paddingHorizontal: space.x5, paddingBottom: space.x4 }}>
      {account.email === undefined ? null : (
        <Pressable
          testID="account-email"
          accessibilityRole="button"
          accessibilityLabel={
            shown ? t.modelProviders.emailShown(account.email) : t.modelProviders.showEmail
          }
          onPress={() => setShown((value) => !value)}
          style={{ minHeight: theme.touch, justifyContent: 'center' }}
        >
          <Text variant="meta" tone="muted">
            {shown ? account.email : maskEmail(account.email)}
          </Text>
        </Pressable>
      )}
      {account.available ? <QuotaWindows quota={account.quota} now={now} /> : null}
      {account.available &&
      quotaLimited(account.quota, now) &&
      account.quota?.limitedUntil !== undefined ? (
        <Notice tone="warning">
          {t.modelProviders.limitedUntil(shortTime(account.quota.limitedUntil))}
        </Notice>
      ) : null}
      {refresh.state === 'failed' ? (
        <Notice tone="danger">{t.modelProviders.refreshFailed[refresh.reason]}</Notice>
      ) : null}
      {signingIn ? (
        <View style={{ gap: space.x3 }}>
          <Text variant="meta" tone="muted">
            {t.modelProviders.signInOnComputer}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x3 }}>
            <Button
              fit
              variant="text"
              label={copied ? t.modelProviders.linkCopied : t.modelProviders.copyLink}
              onPress={() => {
                void Clipboard.setStringAsync(signInUrl).then(() => setCopied(true));
              }}
            />
            <Button
              fit
              variant="text"
              label={t.modelProviders.cancelSignIn}
              onPress={onCancelSignIn}
            />
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
        <Text variant="meta" tone="muted" style={{ flex: 1 }}>
          {refresh.state === 'refreshing'
            ? t.modelProviders.refreshing
            : account.quota === undefined
              ? ''
              : updatedText(account.quota.observedAt, now, t)}
        </Text>
        {account.available ? (
          <Button
            fit
            variant="text"
            symbol="refresh"
            label={t.modelProviders.refresh}
            busy={refresh.state === 'refreshing'}
            disabled={refresh.state === 'refreshing'}
            onPress={onRefresh}
          />
        ) : account.installed && !signingIn ? (
          <Button fit variant="text" label={t.modelProviders.signIn} onPress={onSignIn} />
        ) : null}
      </View>
    </View>
  );
}

export function ModelProvidersSettings({ port }: { port: ModelProvidersPort }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [providers, setProviders] = useState<ModelProvidersView>();
  const [accounts, setAccounts] = useState<SubscriptionAccountsView>();
  const [loadError, setLoadError] = useState<string>();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [refreshes, setRefreshes] = useState<Readonly<Record<string, RefreshState>>>({});
  const [signIns, setSignIns] = useState<Readonly<Record<string, string>>>({});
  const [signInError, setSignInError] = useState(false);

  const load = useCallback(() => {
    setLoadError(undefined);
    Promise.all([port.providers(), port.accounts()]).then(
      ([nextProviders, nextAccounts]) => {
        setProviders(nextProviders);
        setAccounts(nextAccounts);
      },
      (reason: unknown) => setLoadError(errorText(reason)),
    );
  }, [port]);
  const mount = useMounted<ViewInstance>(() => load(), [load]);

  const reloadAccounts = () => {
    port.accounts().then(setAccounts, () => undefined);
  };

  const refresh = (id: string) => {
    setRefreshes((current) => ({ ...current, [id]: { state: 'refreshing' } }));
    port.refresh(id).then(
      (status) => {
        setRefreshes((current) => ({
          ...current,
          [id]: status === 'ok' ? { state: 'idle' } : { state: 'failed', reason: status },
        }));
        reloadAccounts();
      },
      () =>
        setRefreshes((current) => ({
          ...current,
          [id]: { state: 'failed', reason: 'unavailable' },
        })),
    );
  };

  const toggle = (account: SubscriptionAccountView, key: string) => {
    const opening = !expanded.has(key);
    setExpanded((current) => {
      const next = new Set(current);
      if (opening) next.add(key);
      else next.delete(key);
      return next;
    });
    if (
      opening &&
      account.id !== undefined &&
      account.available &&
      refreshes[account.id]?.state !== 'refreshing' &&
      quotaStale(account.quota, Date.now())
    )
      refresh(account.id);
  };

  const signIn = (id: string) => {
    setSignInError(false);
    port.signIn(id).then(
      ({ url }) => {
        if (url !== undefined) setSignIns((current) => ({ ...current, [id]: url }));
        reloadAccounts();
      },
      () => setSignInError(true),
    );
  };

  const cancelSignIn = (id: string) => {
    port.cancelSignIn(id).then(
      () => {
        setSignIns(({ [id]: _removed, ...rest }) => rest);
        reloadAccounts();
      },
      () => setSignInError(true),
    );
  };

  const now = Date.now();
  const ready = providers !== undefined && accounts !== undefined;
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <SettingsForm testID="model-providers-settings">
        {loadError !== undefined ? (
          <SettingsFormItem>
            <LoadFailed error={loadError} onRetry={load} />
          </SettingsFormItem>
        ) : null}
        {!ready && loadError === undefined ? (
          <SettingsFormItem>
            <Loading />
          </SettingsFormItem>
        ) : null}
        {providers === undefined ? null : providers.providers.length === 0 ? (
          <SettingsFormItem>
            <SettingsFooter>{t.modelProviders.noProviders}</SettingsFooter>
          </SettingsFormItem>
        ) : (
          <SettingsSection title={t.modelProviders.apiKeys} on="raised">
            {providers.providers.map((provider) => (
              <SettingsRow
                on="raised"
                key={provider.id}
                title={provider.name}
                detail={providerDetail(provider, t)}
                leading={
                  <ModelBrandIcon
                    brand={modelBrand({ provider: provider.id, model: provider.name })}
                    size={theme.type.title.line}
                    color={theme.color.fg}
                  />
                }
              />
            ))}
          </SettingsSection>
        )}
        {accounts === undefined ? null : accounts.accounts.length === 0 ? (
          <SettingsFormItem>
            <SettingsFooter>{t.modelProviders.noAccounts}</SettingsFooter>
          </SettingsFormItem>
        ) : (
          <SettingsSection title={t.modelProviders.subscriptions} on="raised">
            {accounts.accounts.map((account) => {
              const id = account.id;
              const key = id ?? account.engine;
              const open = expanded.has(key);
              const signingIn = id !== undefined && signIns[id] !== undefined;
              const status = signingIn
                ? { text: t.modelProviders.signingIn, color: theme.color.warning }
                : account.available
                  ? { text: t.modelProviders.signedIn, color: theme.color.success }
                  : {
                      text: t.modelProviders.status[account.reason ?? 'login-unknown'],
                      color:
                        account.reason === 'not-subscription'
                          ? theme.color.danger
                          : account.reason === 'login-unknown' ||
                              account.reason === 'host-not-local'
                            ? theme.color.warning
                            : theme.color.muted,
                    };
              const detail =
                account.email === undefined
                  ? status.text
                  : `${status.text} · ${maskEmail(account.email)}`;
              return (
                <View key={key} testID={`subscription-account-${key}`}>
                  <SettingsRow
                    on="raised"
                    title={accountTitle(account)}
                    detail={detail}
                    detailDot={status.color}
                    expanded={open}
                    leading={
                      <EngineBrandIcon
                        brand={account.engine === 'codex' ? 'openai' : 'claude'}
                        color={theme.color.fg}
                      />
                    }
                    control={
                      account.available
                        ? { kind: 'value', text: quotaChip(account.quota, now, t) }
                        : undefined
                    }
                    onPress={() => toggle(account, key)}
                  />
                  {open && id !== undefined ? (
                    <AccountDetail
                      account={account}
                      now={now}
                      refresh={refreshes[id] ?? { state: 'idle' }}
                      signInUrl={signIns[id]}
                      onRefresh={() => refresh(id)}
                      onSignIn={() => signIn(id)}
                      onCancelSignIn={() => cancelSignIn(id)}
                    />
                  ) : null}
                </View>
              );
            })}
          </SettingsSection>
        )}
        {signInError ? (
          <SettingsFormItem>
            <Notice tone="danger">{t.modelProviders.signInFailed}</Notice>
          </SettingsFormItem>
        ) : null}
      </SettingsForm>
    </View>
  );
}
