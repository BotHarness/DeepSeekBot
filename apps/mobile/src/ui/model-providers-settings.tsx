import * as Clipboard from 'expo-clipboard';
import { useCallback, useRef, useState } from 'react';
import { View, type ViewInstance } from 'react-native';

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
import { SettingsForm, SettingsFormItem } from './primitives/settings-form';
import { SettingsFooter, SettingsRow, SettingsSection } from './primitives/settings-row';
import { Text } from './primitives/text';
import { LoadFailed, Loading, Notice, errorText } from './request-parts';
import { useStrings } from './strings';

export interface ModelProvidersPort {
  providers(): Promise<ModelProvidersView>;
  accounts(): Promise<SubscriptionAccountsView>;
  openAccount(id: string): void;
}

export interface ProviderAccountPort {
  accounts(): Promise<SubscriptionAccountsView>;
  refresh(id: string): Promise<QuotaRefreshStatus>;
  signIn(id: string): Promise<{ url?: string }>;
  cancelSignIn(id: string): Promise<void>;
}

const SIGN_IN_LIMIT_MS = 190_000;

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
    !provider.keyStored
      ? copy.noKey
      : provider.keyLast4 === undefined
        ? copy.keyStored
        : copy.keyLast4(provider.keyLast4),
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

function accountStatus(
  account: SubscriptionAccountView,
  signingIn: boolean,
  t: ReturnType<typeof useStrings>,
  color: ReturnType<typeof useDesignTheme>['color'],
): { text: string; color: string } {
  if (signingIn) return { text: t.modelProviders.signingIn, color: color.warning };
  if (account.available) return { text: t.modelProviders.signedIn, color: color.success };
  const reason = account.reason ?? 'login-unknown';
  return {
    text: t.modelProviders.status[reason],
    color:
      reason === 'not-subscription'
        ? color.danger
        : reason === 'login-unknown' || reason === 'host-not-local'
          ? color.warning
          : color.muted,
  };
}

export function ModelProvidersSettings({
  port,
  focusTick = 0,
}: {
  port: ModelProvidersPort;
  focusTick?: number;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [providers, setProviders] = useState<ModelProvidersView>();
  const [accounts, setAccounts] = useState<SubscriptionAccountsView>();
  const [loadError, setLoadError] = useState<string>();
  const generation = useRef(0);

  const load = useCallback(() => {
    const ticket = ++generation.current;
    setLoadError(undefined);
    Promise.all([port.providers(), port.accounts()]).then(
      ([nextProviders, nextAccounts]) => {
        if (ticket !== generation.current) return;
        setProviders(nextProviders);
        setAccounts(nextAccounts);
      },
      (reason: unknown) => {
        if (ticket === generation.current) setLoadError(errorText(reason));
      },
    );
  }, [port]);
  const mount = useMounted<ViewInstance>(() => load(), [load, focusTick]);

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
              const status = accountStatus(account, false, t, theme.color);
              return (
                <SettingsRow
                  on="raised"
                  key={id ?? account.engine}
                  testID={`subscription-account-${id ?? account.engine}`}
                  title={accountTitle(account)}
                  detail={
                    account.email === undefined
                      ? status.text
                      : `${status.text} · ${maskEmail(account.email)}`
                  }
                  detailDot={status.color}
                  leading={
                    <EngineBrandIcon
                      brand={account.engine === 'codex' ? 'openai' : 'claude'}
                      color={theme.color.fg}
                    />
                  }
                  control={
                    account.available
                      ? { kind: 'value', text: quotaChip(account.quota, now, t), chevron: true }
                      : { kind: 'chevron' }
                  }
                  {...(id === undefined ? {} : { onPress: () => port.openAccount(id) })}
                />
              );
            })}
          </SettingsSection>
        )}
      </SettingsForm>
    </View>
  );
}

export function ProviderAccountSettings({ port, id }: { port: ProviderAccountPort; id: string }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [account, setAccount] = useState<SubscriptionAccountView | null>();
  const [loadError, setLoadError] = useState<string>();
  const [refresh, setRefresh] = useState<RefreshState>({ state: 'idle' });
  const [signInUrl, setSignInUrl] = useState<string>();
  const [signInError, setSignInError] = useState<false | 'failed' | 'timeout'>(false);
  const [emailShown, setEmailShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [, setTick] = useState(0);
  const signingSince = useRef<number | undefined>(undefined);

  const read = useCallback(
    () =>
      port.accounts().then((view) => {
        const next = view.accounts.find((entry) => entry.id === id) ?? null;
        setAccount(next);
        return next;
      }),
    [port, id],
  );

  const runRefresh = useCallback(() => {
    setRefresh({ state: 'refreshing' });
    port.refresh(id).then(
      (status) => {
        read().then(
          () =>
            setRefresh(status === 'ok' ? { state: 'idle' } : { state: 'failed', reason: status }),
          () => setRefresh({ state: 'failed', reason: 'unavailable' }),
        );
      },
      () => setRefresh({ state: 'failed', reason: 'unavailable' }),
    );
  }, [port, id, read]);

  const load = useCallback(() => {
    setLoadError(undefined);
    read().then(
      (next) => {
        if (next !== null && next.available && quotaStale(next.quota, Date.now())) runRefresh();
      },
      (reason: unknown) => setLoadError(errorText(reason)),
    );
  }, [read, runRefresh]);
  const mount = useMounted<ViewInstance>(() => load(), [load]);
  const ticker = useMounted<ViewInstance>(() => {
    const timer = setInterval(() => {
      setTick((tick) => tick + 1);
      if (signingSince.current === undefined) return;
      if (Date.now() - signingSince.current > SIGN_IN_LIMIT_MS) {
        signingSince.current = undefined;
        setSignInUrl(undefined);
        setCopied(false);
        setSignInError('timeout');
        return;
      }
      read().then(
        (next) => {
          if (next?.available) {
            signingSince.current = undefined;
            setSignInUrl(undefined);
            setCopied(false);
          }
        },
        () => undefined,
      );
    }, 5_000);
    return () => clearInterval(timer);
  }, [read]);

  const signIn = () => {
    if (starting) return;
    setSignInError(false);
    setStarting(true);
    port
      .signIn(id)
      .then(
        ({ url }) => {
          if (url !== undefined) {
            signingSince.current = Date.now();
            setSignInUrl(url);
          }
          void read().catch(() => undefined);
        },
        () => setSignInError('failed'),
      )
      .finally(() => setStarting(false));
  };

  const cancelSignIn = () => {
    port.cancelSignIn(id).then(
      () => {
        signingSince.current = undefined;
        setSignInUrl(undefined);
        setCopied(false);
        void read().catch(() => undefined);
      },
      () => setSignInError('failed'),
    );
  };

  const now = Date.now();
  const signingIn = signInUrl !== undefined;
  const status = account ? accountStatus(account, signingIn, t, theme.color) : undefined;
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <View ref={ticker} style={{ flex: 1 }}>
        <SettingsForm testID="provider-account-settings">
          {loadError !== undefined ? (
            <SettingsFormItem>
              <LoadFailed error={loadError} onRetry={load} />
            </SettingsFormItem>
          ) : null}
          {account === undefined && loadError === undefined ? (
            <SettingsFormItem>
              <Loading />
            </SettingsFormItem>
          ) : null}
          {account === null ? (
            <SettingsFormItem>
              <SettingsFooter>{t.modelProviders.noAccounts}</SettingsFooter>
            </SettingsFormItem>
          ) : null}
          {account && status ? (
            <SettingsSection on="raised">
              <SettingsRow
                on="raised"
                title={accountTitle(account)}
                detail={status.text}
                detailDot={status.color}
                leading={
                  <EngineBrandIcon
                    brand={account.engine === 'codex' ? 'openai' : 'claude'}
                    color={theme.color.fg}
                  />
                }
              />
              {account.email === undefined ? null : (
                <SettingsRow
                  on="raised"
                  testID="account-email"
                  title={emailShown ? account.email : maskEmail(account.email)}
                  accessibilityLabel={
                    emailShown
                      ? t.modelProviders.emailShown(account.email)
                      : t.modelProviders.showEmail
                  }
                  control={{
                    kind: 'value',
                    text: emailShown ? t.modelProviders.hideEmail : t.modelProviders.showEmail,
                  }}
                  onPress={() => setEmailShown((value) => !value)}
                />
              )}
            </SettingsSection>
          ) : null}
          {account?.available ? (
            <SettingsFormItem>
              <View style={{ paddingHorizontal: space.x5 }}>
                <QuotaWindows quota={account.quota} now={now} />
              </View>
            </SettingsFormItem>
          ) : null}
          {account?.available &&
          quotaLimited(account.quota, now) &&
          account.quota?.limitedUntil !== undefined ? (
            <SettingsFormItem>
              <Notice tone="warning">
                {t.modelProviders.limitedUntil(shortTime(account.quota.limitedUntil))}
              </Notice>
            </SettingsFormItem>
          ) : null}
          {refresh.state === 'failed' ? (
            <SettingsFormItem>
              <Notice tone="danger">{t.modelProviders.refreshFailed[refresh.reason]}</Notice>
            </SettingsFormItem>
          ) : null}
          {signInError ? (
            <SettingsFormItem>
              <Notice tone="danger">
                {signInError === 'timeout'
                  ? t.modelProviders.signInTimedOut
                  : t.modelProviders.signInFailed}
              </Notice>
            </SettingsFormItem>
          ) : null}
          {account?.available ? (
            <SettingsSection
              on="raised"
              {...(account.quota === undefined
                ? {}
                : { footer: updatedText(account.quota.observedAt, now, t) })}
            >
              <SettingsRow
                on="raised"
                testID="account-refresh"
                title={
                  refresh.state === 'refreshing'
                    ? t.modelProviders.refreshing
                    : t.modelProviders.refresh
                }
                tone="accent"
                {...(refresh.state === 'refreshing'
                  ? { control: { kind: 'busy' as const } }
                  : { onPress: runRefresh })}
              />
            </SettingsSection>
          ) : null}
          {account && !account.available && account.installed ? (
            <SettingsSection
              on="raised"
              {...(signingIn ? { footer: t.modelProviders.signInOnComputer } : {})}
            >
              {signingIn ? (
                <SettingsRow
                  on="raised"
                  testID="account-copy-link"
                  title={copied ? t.modelProviders.linkCopied : t.modelProviders.copyLink}
                  tone="accent"
                  onPress={() => {
                    void Clipboard.setStringAsync(signInUrl).then(() => setCopied(true));
                  }}
                />
              ) : (
                <SettingsRow
                  on="raised"
                  testID="account-sign-in"
                  title={starting ? t.modelProviders.signingIn : t.modelProviders.signIn}
                  tone="accent"
                  {...(starting ? { control: { kind: 'busy' as const } } : { onPress: signIn })}
                />
              )}
              {signingIn ? (
                <SettingsRow
                  on="raised"
                  testID="account-cancel-sign-in"
                  title={t.modelProviders.cancelSignIn}
                  tone="danger"
                  onPress={cancelSignIn}
                />
              ) : null}
            </SettingsSection>
          ) : null}
        </SettingsForm>
      </View>
    </View>
  );
}
