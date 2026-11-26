import { useNavigation, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import type { RosterBot } from '@botharness/host-client/client';
import type { HostCall } from '@botharness/host-client/host-answer';
import {
  bindApp,
  messagingApps,
  unbindApp,
  type Loaded,
  type MessagingApp,
} from '../../host/messaging-settings';
import { SHEET_GROUP } from '../chat/sheet';
import { confirmAppDialog } from '../primitives/app-dialog';
import { SettingsForm, SettingsFormItem } from '../primitives/settings-form';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { LoadFailed, Loading, Notice, errorText } from '../request-parts';
import { useStrings } from '../strings';
import { useFocusedResource } from './use-resource';

export function appKey(app: Pick<MessagingApp, 'providerId' | 'ref'>): string {
  return `${app.providerId}:${app.ref}`;
}

function bindable(app: MessagingApp): boolean {
  return app.connected && app.unsupported === undefined;
}

export function useBotName(bots: readonly RosterBot[] | undefined) {
  const t = useStrings();
  return (slug: string) =>
    bots?.find((bot) => bot.slug === slug)?.displayName ?? t.imApps.removedBot;
}

export function appDetail(t: ReturnType<typeof useStrings>, app: MessagingApp): string {
  return `${t.imApps.platform(app.platform)} · ${
    app.connected ? t.imApps.connected : t.imApps.disconnected
  }`;
}

export function ImAppsScreen({
  host,
  bots,
}: {
  host: HostCall;
  bots: readonly RosterBot[] | undefined;
}) {
  const t = useStrings();
  const router = useRouter();
  const source = useMemo(() => messagingApps(host), [host]);
  const loaded = useFocusedResource(source);
  const botName = useBotName(bots);
  return (
    <SettingsForm testID="im-apps">
      {loaded.status === 'loading' ? (
        <SettingsFormItem>
          <Loading />
        </SettingsFormItem>
      ) : loaded.status === 'failed' ? (
        <SettingsFormItem>
          <LoadFailed error={errorText(loaded.error)} onRetry={() => void source.load()} />
        </SettingsFormItem>
      ) : loaded.value.apps.length === 0 ? (
        <SettingsSection on={SHEET_GROUP} footer={t.imApps.emptyHint}>
          <SettingsRow on={SHEET_GROUP} title={t.imApps.empty} tone="muted" />
        </SettingsSection>
      ) : (
        <SettingsSection on={SHEET_GROUP} title={t.imApps.apps} footer={t.imApps.appsHint}>
          {loaded.value.apps.map((app) => (
            <SettingsRow
              key={appKey(app)}
              on={SHEET_GROUP}
              testID={`im-app-${app.ref}`}
              title={app.name}
              detail={appDetail(t, app)}
              control={{
                kind: 'value',
                text: app.boundBotSlug === undefined ? t.imApps.unbound : botName(app.boundBotSlug),
                chevron: true,
              }}
              onPress={() =>
                router.push({
                  pathname: '/settings/im-app',
                  params: { providerId: app.providerId, ref: app.ref },
                })
              }
            />
          ))}
        </SettingsSection>
      )}
      {loaded.status === 'ready' && loaded.error !== undefined ? (
        <SettingsFormItem>
          <Notice tone="danger">{`${t.imApps.loadFailed} ${errorText(loaded.error)}`}</Notice>
        </SettingsFormItem>
      ) : null}
    </SettingsForm>
  );
}

export function ImAppScreen({
  host,
  bots,
  providerId,
  appRef,
}: {
  host: HostCall;
  bots: readonly RosterBot[] | undefined;
  providerId: string;
  appRef: string;
}) {
  const t = useStrings();
  const source = useMemo(() => messagingApps(host), [host]);
  const loaded = useFocusedResource(source);
  const botName = useBotName(bots);
  const [saving, setSaving] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const app =
    loaded.status === 'ready'
      ? loaded.value.apps.find((item) => item.providerId === providerId && item.ref === appRef)
      : undefined;
  if (loaded.status === 'loading')
    return (
      <SettingsForm>
        <SettingsFormItem>
          <Loading />
        </SettingsFormItem>
      </SettingsForm>
    );
  if (app === undefined)
    return (
      <SettingsForm>
        <SettingsFormItem>
          <LoadFailed
            error={loaded.status === 'failed' ? errorText(loaded.error) : t.imApps.loadFailed}
            onRetry={() => void source.load()}
          />
        </SettingsFormItem>
      </SettingsForm>
    );
  const run = async (key: string, work: () => Promise<void>) => {
    if (saving !== undefined) return;
    setSaving(key);
    setFailure(undefined);
    try {
      await work();
    } catch (error) {
      setFailure(`${t.imApps.failed} ${errorText(error)}`);
    } finally {
      setSaving(undefined);
    }
  };
  const choose = async (bot: RosterBot) => {
    if (saving !== undefined || app.boundBotSlug === bot.slug) return;
    if (
      app.boundBotSlug !== undefined &&
      !(await confirmAppDialog(
        t.imApps.rebindTitle(app.name, bot.displayName),
        t.imApps.rebindBody(botName(app.boundBotSlug), app.name),
        t.imApps.move,
      ))
    )
      return;
    await run(bot.slug, () => bindApp(host, app, bot.slug));
  };
  const unbind = async () => {
    const bound = app.boundBotSlug;
    if (saving !== undefined || bound === undefined) return;
    if (
      !(await confirmAppDialog(
        t.imApps.unbindTitle(app.name),
        t.imApps.unbindBody(botName(bound), app.name),
        t.imApps.unbind,
      ))
    )
      return;
    await run('unbind', () => unbindApp(host, app));
  };
  const choices = (bots ?? []).filter((bot) => !bot.paused || bot.slug === app.boundBotSlug);
  return (
    <SettingsForm testID="im-app">
      <SettingsSection on={SHEET_GROUP}>
        <SettingsRow on={SHEET_GROUP} title={app.name} detail={appDetail(t, app)} />
      </SettingsSection>
      {failure === undefined ? null : (
        <SettingsFormItem>
          <Notice tone="danger">{failure}</Notice>
        </SettingsFormItem>
      )}
      <RefreshFailed loaded={loaded} onRetry={() => void source.load()} />
      {bindable(app) || app.boundBotSlug !== undefined ? (
        <SettingsSection on={SHEET_GROUP} title={t.imApps.boundTo} footer={t.imApps.boundToHint}>
          {choices.map((bot) => (
            <SettingsRow
              key={bot.slug}
              on={SHEET_GROUP}
              testID={`im-app-bot-${bot.slug}`}
              title={bot.displayName}
              selected={bot.slug === app.boundBotSlug}
              {...(saving === bot.slug
                ? { control: { kind: 'busy' as const } }
                : bot.slug === app.boundBotSlug
                  ? { control: { kind: 'check' as const } }
                  : {})}
              onPress={bindable(app) && saving === undefined ? () => void choose(bot) : undefined}
            />
          ))}
        </SettingsSection>
      ) : (
        <SettingsSection on={SHEET_GROUP}>
          <SettingsRow on={SHEET_GROUP} title={t.imApps.unsupported} tone="muted" />
        </SettingsSection>
      )}
      {app.boundBotSlug === undefined ? null : (
        <SettingsSection on={SHEET_GROUP}>
          <SettingsRow
            on={SHEET_GROUP}
            testID="im-app-unbind"
            title={t.imApps.unbind}
            tone="danger"
            {...(saving === 'unbind' ? { control: { kind: 'busy' as const } } : {})}
            onPress={saving === undefined ? () => void unbind() : undefined}
          />
        </SettingsSection>
      )}
    </SettingsForm>
  );
}

export function BotImBindScreen({
  host,
  bot,
  bots,
  onDone,
}: {
  host: HostCall;
  bot: RosterBot;
  bots: readonly RosterBot[] | undefined;
  onDone: () => void;
}) {
  const t = useStrings();
  const source = useMemo(() => messagingApps(host), [host]);
  const loaded = useFocusedResource(source);
  const botName = useBotName(bots);
  const navigation = useNavigation();
  const [saving, setSaving] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const choose = async (app: MessagingApp) => {
    if (saving !== undefined) return;
    if (
      app.boundBotSlug !== undefined &&
      !(await confirmAppDialog(
        t.imApps.rebindTitle(app.name, bot.displayName),
        t.imApps.rebindBody(botName(app.boundBotSlug), app.name),
        t.imApps.move,
      ))
    )
      return;
    setSaving(appKey(app));
    setFailure(undefined);
    try {
      await bindApp(host, app, bot.slug);
      if (navigation.isFocused()) onDone();
    } catch (error) {
      setFailure(`${t.imApps.failed} ${errorText(error)}`);
    } finally {
      setSaving(undefined);
    }
  };
  const apps =
    loaded.status === 'ready'
      ? loaded.value.apps.filter((app) => bindable(app) && app.boundBotSlug !== bot.slug)
      : [];
  return (
    <SettingsForm testID="bot-im-bind">
      {loaded.status === 'loading' ? (
        <SettingsFormItem>
          <Loading />
        </SettingsFormItem>
      ) : loaded.status === 'failed' ? (
        <SettingsFormItem>
          <LoadFailed error={errorText(loaded.error)} onRetry={() => void source.load()} />
        </SettingsFormItem>
      ) : (
        <SettingsSection
          on={SHEET_GROUP}
          title={t.imApps.apps}
          footer={apps.length === 0 ? t.imApps.emptyHint : t.imApps.bindAppHint}
        >
          {apps.length === 0 ? (
            <SettingsRow on={SHEET_GROUP} title={t.imApps.noFreeApps} tone="muted" />
          ) : (
            apps.map((app) => (
              <SettingsRow
                key={appKey(app)}
                on={SHEET_GROUP}
                testID={`bot-im-bind-${app.ref}`}
                title={app.name}
                detail={appDetail(t, app)}
                {...(saving === appKey(app)
                  ? { control: { kind: 'busy' as const } }
                  : {
                      control: {
                        kind: 'value' as const,
                        text:
                          app.boundBotSlug === undefined
                            ? t.imApps.unbound
                            : botName(app.boundBotSlug),
                      },
                    })}
                onPress={saving === undefined ? () => void choose(app) : undefined}
              />
            ))
          )}
        </SettingsSection>
      )}
      {failure === undefined ? null : (
        <SettingsFormItem>
          <Notice tone="danger">{failure}</Notice>
        </SettingsFormItem>
      )}
      <RefreshFailed loaded={loaded} onRetry={() => void source.load()} />
    </SettingsForm>
  );
}

function RefreshFailed({ loaded, onRetry }: { loaded: Loaded<unknown>; onRetry: () => void }) {
  const t = useStrings();
  if (loaded.status !== 'ready' || loaded.error === undefined) return null;
  return (
    <SettingsFormItem>
      <LoadFailed error={`${t.imApps.loadFailed} ${errorText(loaded.error)}`} onRetry={onRetry} />
    </SettingsFormItem>
  );
}
