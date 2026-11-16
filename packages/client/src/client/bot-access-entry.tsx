import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Checkbox, Switch } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeCall } from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { emptyAudience, toggleAudience } from './audience-field.js';
import { Field, FieldStack } from './ds/field.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { useClientStore } from './use-client-store.js';
import {
  loadBotAccess,
  sameVisibility,
  setBotSwitches,
  setBotVisibility,
  setProactiveOptOut,
  type BotAccess,
  type BotSwitches,
  type BotVisibility,
  type VisibilityPreview,
} from './team-bots-bridge.js';
import { teamErrorText } from './team-settings.js';
import { useTeamMode } from './team-state.js';
import { audienceOptions, audienceSummary } from './team-spaces-view.js';
import { audienceReady, type AudienceDirectory } from './team-spaces-bridge.js';

const styles = stylex.create({
  checks: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
});

type Choice = 'private' | 'everyone' | 'roles' | 'members';

const SWITCHES: readonly (keyof BotSwitches)[] = [
  'proactiveDms',
  'joinPrincipalChannels',
  'speakerContext',
];

function choiceOf(visibility: BotVisibility): Choice {
  return visibility.kind === 'private' ? 'private' : visibility.audience.kind;
}

function visibilityFor(choice: Choice): BotVisibility {
  return choice === 'private'
    ? { kind: 'private' }
    : { kind: 'public', audience: emptyAudience(choice) };
}

export function visibilitySummary(
  t: BotHarnessTranslate,
  visibility: BotVisibility,
  directory: AudienceDirectory,
): string {
  return visibility.kind === 'private'
    ? t('botAccess.private')
    : audienceSummary(t, visibility.audience, directory);
}

export function BotAccessEntry({
  botSlug,
  actions,
  t,
  refreshRevision,
}: ChannelSidebarEntryProps): ReactElement | null {
  const call = actions.teamCall;
  const team = useTeamMode(call);
  const enabled = team?.enabled === true && call !== undefined && botSlug !== undefined;
  const [access, setAccess] = useState<BotAccess | 'denied' | 'failed'>();
  const [editing, setEditing] = useState(false);
  const [switchError, setSwitchError] = useState<string>();
  const switchRequest = useRef(0);
  const latestSwitch = useRef<Partial<Record<keyof BotSwitches, number>>>({});
  const updateReady = (patch: Partial<BotAccess>): void =>
    setAccess((current) =>
      current === undefined || typeof current === 'string' ? current : { ...current, ...patch },
    );
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setAccess(undefined);
    loadBotAccess(call, botSlug, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setAccess(value);
      },
      (failure: unknown) => {
        if (controller.signal.aborted) return;
        const code = (failure as { code?: unknown } | undefined)?.code;
        setAccess(code === 'permission-required' || code === 'bot-not-found' ? 'denied' : 'failed');
      },
    );
    return () => controller.abort();
  }, [call, botSlug, enabled, refreshRevision]);
  if (!enabled) return null;
  if (access === 'denied') return <ProactiveOptOutRow call={call} t={t} slug={botSlug} />;
  const ready = access !== undefined && access !== 'failed' ? access : undefined;
  return (
    <div ref={mount} data-bot-access={botSlug}>
      {access === 'failed' ? <Note tone="danger">{t('botAccess.loadFailed')}</Note> : null}
      {ready === undefined ? null : (
        <SettingsSection>
          <SettingsRow
            title={t('botAccess.who')}
            description={visibilitySummary(t, ready.visibility, ready.directory)}
            data={{ 'data-bot-access-row': 'visibility' }}
            control={
              <Button variant="outline" onClick={() => setEditing(true)}>
                {t('botAccess.change')}
              </Button>
            }
          />
          {SWITCHES.map((key) => (
            <SettingsRow
              key={key}
              title={t(`botAccess.switch.${key}`)}
              description={t(`botAccess.switch.${key}.hint`)}
              data={{ 'data-bot-access-row': key }}
              control={
                <Switch
                  label={t(`botAccess.switch.${key}`)}
                  checked={ready.switches[key]}
                  onChange={(checked) => {
                    setSwitchError(undefined);
                    const request = ++switchRequest.current;
                    latestSwitch.current[key] = request;
                    const latest = (): boolean => latestSwitch.current[key] === request;
                    void setBotSwitches(call, botSlug, { [key]: checked }).then(
                      (switches) => {
                        if (!latest()) return;
                        setAccess((current) =>
                          current === undefined || typeof current === 'string'
                            ? current
                            : {
                                ...current,
                                switches: { ...current.switches, [key]: switches[key] },
                              },
                        );
                      },
                      (failure: unknown) => {
                        if (latest()) setSwitchError(teamErrorText(t, failure));
                      },
                    );
                  }}
                />
              }
            />
          ))}
          {switchError === undefined ? null : <Note tone="danger">{switchError}</Note>}
        </SettingsSection>
      )}
      {editing && ready !== undefined ? (
        <VisibilityDialog
          call={call}
          t={t}
          slug={botSlug}
          access={ready}
          onClose={() => setEditing(false)}
          onApplied={(visibility) => {
            setEditing(false);
            updateReady({ visibility });
          }}
        />
      ) : null}
    </div>
  );
}

function VisibilityDialog({
  call,
  t,
  slug,
  access,
  onClose,
  onApplied,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  slug: string;
  access: BotAccess;
  onClose(): void;
  onApplied(visibility: BotVisibility): void;
}): ReactElement {
  const [visibility, setVisibility] = useState<BotVisibility>(access.visibility);
  const [preview, setPreview] = useState<VisibilityPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const stored = access.visibility.kind === 'public' ? access.visibility.audience : undefined;
  const audience = visibility.kind === 'public' ? visibility.audience : undefined;
  const options =
    audience === undefined ? [] : audienceOptions(t, audience, stored, access.directory);
  const chosen =
    audience?.kind === 'roles'
      ? audience.roleIds
      : audience?.kind === 'members'
        ? audience.humanIds
        : [];
  const apply = (confirm: boolean): void => {
    setBusy(true);
    setError(undefined);
    setBotVisibility(call, slug, visibility, confirm)
      .then((result) => {
        if (result.applied) onApplied(result.visibility);
        else {
          setPreview(result.preview);
          setBusy(false);
        }
      })
      .catch((failure: unknown) => {
        setError(teamErrorText(t, failure));
        setBusy(false);
      });
  };
  const errorNote = error === undefined ? undefined : <Note tone="danger">{error}</Note>;
  if (preview !== undefined)
    return (
      <ConfirmDialog
        title={t('botAccess.shrinkTitle')}
        description={
          [
            preview.dmsBecomingReadOnly === 1
              ? t('botAccess.shrinkDmsOne')
              : preview.dmsBecomingReadOnly > 1
                ? t('botAccess.shrinkDms', { count: String(preview.dmsBecomingReadOnly) })
                : undefined,
            preview.channelsLeaving === 1
              ? t('botAccess.shrinkChannelsOne')
              : preview.channelsLeaving > 1
                ? t('botAccess.shrinkChannels', { count: String(preview.channelsLeaving) })
                : undefined,
            memoryLine(t, preview),
          ]
            .filter((line): line is string => line !== undefined)
            .join(' ')
            .trim() || t('botAccess.shrinkNone')
        }
        labels={{ close: t('common.close'), cancel: t('common.cancel') }}
        confirmLabel={t('botAccess.apply')}
        busy={busy}
        error={errorNote}
        onCancel={() => setPreview(undefined)}
        onConfirm={() => apply(true)}
      />
    );
  return (
    <FormDialog
      title={t('botAccess.dialogTitle')}
      description={t('botAccess.dialogBody')}
      size="medium"
      scroll
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('botAccess.apply')}
      submitDisabled={
        sameVisibility(visibility, access.visibility) ||
        (audience !== undefined && !audienceReady(audience))
      }
      busy={busy}
      error={errorNote}
      onCancel={onClose}
      onSubmit={() => apply(false)}
    >
      <FieldStack>
        <Field label={t('botAccess.who')} group>
          {() => (
            <>
              <Select
                label={t('botAccess.who')}
                value={choiceOf(visibility)}
                disabled={busy}
                options={[
                  { value: 'private', label: t('botAccess.private') },
                  { value: 'everyone', label: t('botAccess.everyone') },
                  { value: 'roles', label: t('botAccess.roles') },
                  { value: 'members', label: t('botAccess.members') },
                ]}
                onChange={(value) => setVisibility(visibilityFor(value as Choice))}
              />
              {audience === undefined || options.length === 0 ? null : (
                <div {...stylex.props(styles.checks)}>
                  {options.map((option) => (
                    <div key={option.id} data-audience-option={option.id}>
                      <Checkbox
                        label={option.label}
                        checked={chosen.includes(option.id)}
                        disabled={busy}
                        onChange={(checked) =>
                          setVisibility({
                            kind: 'public',
                            audience: toggleAudience(audience, option.id, checked),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Field>
        {visibility.kind === 'public' ? <Note>{t('botAccess.memoryNote')}</Note> : null}
      </FieldStack>
    </FormDialog>
  );
}

function ProactiveOptOutRow({
  call,
  t,
  slug,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  slug: string;
}): ReactElement | null {
  const stored = useClientStore((state) =>
    state.conversation.channel?.botSlug === slug
      ? state.conversation.channel.proactiveOptOut
      : undefined,
  );
  const [optOut, setOptOut] = useState<boolean>();
  const [error, setError] = useState<string>();
  const current = optOut ?? stored;
  if (current === undefined) return null;
  return (
    <SettingsSection>
      <SettingsRow
        title={t('botAccess.allowProactive')}
        description={t('botAccess.allowProactive.hint')}
        data={{ 'data-bot-access-row': 'proactive-opt-out' }}
        control={
          <Switch
            label={t('botAccess.allowProactive')}
            checked={!current}
            onChange={(checked) => {
              setError(undefined);
              void setProactiveOptOut(call, slug, !checked).then(
                () => setOptOut(!checked),
                (failure: unknown) => setError(teamErrorText(t, failure)),
              );
            }}
          />
        }
      />
      {error === undefined ? null : <Note tone="danger">{error}</Note>}
    </SettingsSection>
  );
}

function memoryLine(t: BotHarnessTranslate, preview: VisibilityPreview): string | undefined {
  const { memoryFrom: from, memoryTo: to } = preview;
  if (from === undefined || to === undefined || from === to) return undefined;
  return t(to.startsWith('shared/') ? 'botAccess.memoryToShared' : 'botAccess.memoryToAccount');
}
