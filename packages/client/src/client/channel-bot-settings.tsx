import { useRef, useState } from 'react';
import { channelBotSettings } from '@botharness/host-client/channel-bots';
import type {
  ChannelBotAudience,
  ChannelBotChange,
  ChannelBotSettings,
  ChannelBotsView,
} from '@botharness/host-protocol/channel-bots';
import { bridgeHost, type BridgeCall } from './bridge.js';
import { Button } from './ds/button.js';
import { Checkbox } from './ds/checkbox.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import {
  SettingsGroupPart,
  SettingsRow,
  SettingsSection,
  SettingsValue,
} from './ds/settings-row.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const audienceKinds = ['everyone', 'roles', 'admins'] as const;

export function ChannelBotSettingsPanel({
  channelId,
  call,
  t,
}: {
  channelId: string;
  call: BridgeCall;
  t: BotHarnessTranslate;
}) {
  const [view, setView] = useState<ChannelBotsView>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const write = useRef(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    void channelBotSettings(bridgeHost(call, controller.signal), channelId).then(
      (value) => {
        if (!controller.signal.aborted) setView(value);
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      },
    );
    return () => controller.abort();
  }, [call, channelId]);
  const save = async (botSlug: string, change: ChannelBotChange) => {
    if (write.current) return false;
    write.current = true;
    setBusy(true);
    setFailed(false);
    try {
      setView(await channelBotSettings(bridgeHost(call), channelId, { botSlug, change }));
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      write.current = false;
      setBusy(false);
    }
  };
  return (
    <div ref={mount}>
      {failed ? <Note tone="danger">{t('channelBots.unavailable')}</Note> : null}
      {view?.bots.length === 0 ? <Note>{t('channelBots.noBots')}</Note> : null}
      {view?.bots.map((bot) => (
        <BotSettings
          key={bot.botSlug}
          bot={bot}
          view={view}
          t={t}
          busy={busy}
          save={(change) => save(bot.botSlug, change)}
        />
      ))}
    </div>
  );
}

function BotSettings({
  bot,
  view,
  t,
  busy,
  save,
}: {
  bot: ChannelBotSettings;
  view: ChannelBotsView;
  t: BotHarnessTranslate;
  busy: boolean;
  save(change: ChannelBotChange): Promise<boolean>;
}) {
  const [draft, setDraft] = useState<ChannelBotAudience>();
  const audience = draft ?? bot.audience;
  const canSave = draft !== undefined && (draft.kind !== 'roles' || draft.roleIds.length > 0);
  const nameOf = (id: string) =>
    view.members.find((member) => member.humanId === id)?.displayName ?? id;
  const candidates = view.members.filter((member) => !bot.blockedHumanIds.includes(member.humanId));
  return (
    <SettingsSection
      title={bot.name}
      action={
        draft === undefined ? undefined : (
          <Button
            variant="primary"
            disabled={busy || !canSave}
            onClick={() => {
              void save({ kind: 'audience', audience: draft }).then((saved) => {
                if (saved) setDraft(undefined);
              });
            }}
          >
            {t('channelAccess.save')}
          </Button>
        )
      }
    >
      <SettingsRow
        title={t('channelBots.audience')}
        description={t('channelBots.intersection')}
        control={
          bot.canSetAudience ? (
            <Select
              label={t('channelBots.audience')}
              value={audience.kind}
              disabled={busy}
              options={audienceKinds.map((value) => ({
                value,
                label: t(`channelBots.audience.${value}`),
              }))}
              onChange={(kind) =>
                setDraft(
                  kind === 'roles'
                    ? {
                        kind,
                        roleIds:
                          bot.audience.kind === 'roles'
                            ? bot.audience.roleIds.filter((id) =>
                                view.roles.some((role) => role.roleId === id),
                              )
                            : [],
                      }
                    : { kind },
                )
              }
            />
          ) : (
            <SettingsValue>{t(`channelBots.audience.${audience.kind}`)}</SettingsValue>
          )
        }
      />
      {bot.canSetAudience && audience.kind === 'roles'
        ? view.roles.map(({ roleId, name }) => (
            <SettingsGroupPart key={roleId}>
              <Checkbox
                disabled={busy}
                label={name}
                checked={audience.roleIds.includes(roleId)}
                onChange={(checked) =>
                  setDraft({
                    kind: 'roles',
                    roleIds: checked
                      ? [...audience.roleIds, roleId]
                      : audience.roleIds.filter((id) => id !== roleId),
                  })
                }
              />
            </SettingsGroupPart>
          ))
        : null}
      <SettingsRow
        title={t('channelBots.blocks')}
        control={
          <Select
            label={t('channelBots.addBlock')}
            value=""
            disabled={busy || candidates.length === 0}
            options={[
              { value: '', label: t('channelBots.addBlock') },
              ...candidates.map(({ humanId, displayName }) => ({
                value: humanId,
                label: displayName,
              })),
            ]}
            onChange={(humanId) => {
              if (humanId) void save({ kind: 'block', humanId, blocked: true });
            }}
          />
        }
      />
      {bot.blockedHumanIds.map((humanId) => (
        <SettingsRow
          key={humanId}
          title={nameOf(humanId)}
          control={
            <Button
              variant="outline"
              disabled={busy}
              aria-label={t('channelBots.removeBlock', { name: nameOf(humanId) })}
              onClick={() => {
                void save({ kind: 'block', humanId, blocked: false });
              }}
            >
              {t('channelBots.remove')}
            </Button>
          }
        />
      ))}
    </SettingsSection>
  );
}
