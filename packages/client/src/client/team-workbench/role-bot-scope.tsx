import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import {
  STALE_HOST_ROLE,
  readRoleBotScope,
  setRoleBotScope,
  type RoleBotScopeView,
} from '@botharness/host-client/team-roles';
import { bridgeHost, type BridgeCall } from '../bridge.js';
import { Button } from '../ds/button.js';
import { Icon } from '../ds/icon.js';
import { Note } from '../ds/note.js';
import { ReadFailure } from '../ds/read-failure.js';
import { SegmentedControl } from '../ds/segmented.js';
import { SettingsRow, SettingsSection } from '../ds/settings-row.js';
import { Switch } from '../ds/switch.js';
import { Tag } from '../ds/tag.js';
import { space } from '../ds/tobs.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from '../locale.js';
import { useMountedResource } from '../mounted-resource.js';
import { teamRefusal } from '../team-bridge.js';
import { teamErrorText } from '../team-settings.js';
import { GroupCaption } from './group-caption.js';

type ScopeKind = RoleBotScopeView['kind'];
type ScopeBot = RoleBotScopeView['bots'][number];

export interface BotScopeDraft {
  readonly kind: ScopeKind;
  readonly slugs: ReadonlySet<string>;
}

const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: space.x3 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: space.x2 },
});

export function savedDraft(view: RoleBotScopeView): BotScopeDraft {
  return {
    kind: view.kind,
    slugs: new Set(view.bots.filter((bot) => bot.editable && bot.selected).map((bot) => bot.slug)),
  };
}

export function draftChanged(view: RoleBotScopeView, draft: BotScopeDraft): boolean {
  if (draft.kind !== view.kind) return true;
  if (draft.kind === 'all') return false;
  const saved = savedDraft(view).slugs;
  return saved.size !== draft.slugs.size || [...draft.slugs].some((slug) => !saved.has(slug));
}

export interface BotScopeRow {
  readonly on: boolean;
  readonly editable: boolean;
  readonly reason: BotHarnessKey | undefined;
}

export function scopeRow(view: RoleBotScopeView, draft: BotScopeDraft, bot: ScopeBot): BotScopeRow {
  if (bot.audience === 'everyone')
    return { on: true, editable: false, reason: 'team.workbench.botScope.reason.everyone' };
  if (draft.kind === 'all')
    return { on: true, editable: false, reason: 'team.workbench.botScope.reason.all' };
  if (bot.editable) return { on: draft.slugs.has(bot.slug), editable: true, reason: undefined };
  return {
    on: bot.selected,
    editable: false,
    reason: !view.canSetSelected
      ? 'team.workbench.botScope.roleLocked'
      : bot.audience === 'members'
        ? 'team.workbench.botScope.reason.members'
        : 'team.workbench.botScope.reason.manage',
  };
}

export function RoleBotScope({
  call,
  t,
  roleId,
  revision,
  onChanged,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  roleId: string;
  revision: number;
  onChanged(): void;
}): ReactElement {
  const [view, setView] = useState<RoleBotScopeView>();
  const [draft, setDraft] = useState<BotScopeDraft & { editableBotsRevision: string }>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [stale, setStale] = useState<'none' | 'reloading' | 'reloaded'>('none');
  const completedSaves = useRef(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    const savesAtRead = completedSaves.current;
    const obsolete = () => controller.signal.aborted || savesAtRead !== completedSaves.current;
    void readRoleBotScope(bridgeHost(call, controller.signal), roleId)
      .then((next) => {
        if (obsolete()) return;
        setView(next);
        setDraft((previous) =>
          previous?.editableBotsRevision === next.editableBotsRevision ? previous : undefined,
        );
        setFailed(false);
        setStale((value) => (value === 'reloading' ? 'reloaded' : value));
      })
      .catch(() => {
        if (!obsolete()) setFailed(true);
      });
    return () => controller.abort();
  }, [call, roleId, revision, attempt]);

  const reloadFailure = (
    <ReadFailure
      retryLabel={t('team.workbench.retry')}
      onRetry={() => {
        setFailed(false);
        setAttempt((value) => value + 1);
      }}
    >
      {t('team.workbench.botScope.loadFailed')}
    </ReadFailure>
  );

  if (view === undefined)
    return (
      <div ref={mount} data-team-bot-scope="">
        {failed ? reloadFailure : <Note>{t('team.workbench.loading')}</Note>}
      </div>
    );

  const current =
    draft?.editableBotsRevision === view.editableBotsRevision ? draft : savedDraft(view);
  const dirty = draftChanged(view, current);
  const readOnly = !view.canSetAll && !view.canSetSelected;
  const choose = (kind: ScopeKind): void => {
    setError(undefined);
    setDraft({ kind, slugs: current.slugs, editableBotsRevision: view.editableBotsRevision });
  };
  const toggle = (slug: string, on: boolean): void => {
    const slugs = new Set(current.slugs);
    if (on) slugs.add(slug);
    else slugs.delete(slug);
    setError(undefined);
    setDraft({ kind: 'selected', slugs, editableBotsRevision: view.editableBotsRevision });
  };
  const save = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const editable = new Set(view.bots.filter((bot) => bot.editable).map((bot) => bot.slug));
    try {
      const next = await setRoleBotScope(bridgeHost(call), {
        roleId,
        expectedRevision: view.revision,
        scope:
          current.kind === 'all'
            ? { kind: 'all' }
            : {
                kind: 'selected',
                expectedEditableBotsRevision: view.editableBotsRevision,
                botSlugs: [...current.slugs].filter((slug) => editable.has(slug)),
              },
      });
      completedSaves.current++;
      setView(next);
      setDraft(undefined);
      setFailed(false);
      setStale('none');
      onChanged();
    } catch (failure) {
      if (teamRefusal(failure) === STALE_HOST_ROLE) {
        setStale('reloading');
        setAttempt((value) => value + 1);
      } else setError(teamErrorText(t, failure));
    } finally {
      setBusy(false);
    }
  };
  const kindHint =
    current.kind === 'all'
      ? 'team.workbench.botScope.all.hint'
      : 'team.workbench.botScope.selected.hint';

  return (
    <div ref={mount} data-team-bot-scope={roleId} {...stylex.props(styles.root)}>
      <SettingsSection
        title={t('team.workbench.botScope.title')}
        description={t('team.workbench.botScope.private')}
        action={<Tag tone="info">{t('team.workbench.enforced')}</Tag>}
        data={{ 'data-team-bot-scope-kind': view.kind }}
      >
        <SettingsRow
          title={t('team.workbench.botScope.mode')}
          description={
            readOnly
              ? t('team.workbench.botScope.roleLocked')
              : !view.canSetAll && current.kind === 'selected'
                ? `${t(kindHint)} ${t('team.workbench.botScope.allLocked')}`
                : t(kindHint)
          }
          control={
            <SegmentedControl<ScopeKind>
              id={`team-bot-scope-${roleId}`}
              label={t('team.workbench.botScope.mode')}
              value={current.kind}
              disabled={busy || readOnly}
              options={[
                {
                  value: 'all',
                  label: t('team.workbench.botScope.all'),
                  disabled: !view.canSetAll,
                  title: view.canSetAll ? undefined : t('team.workbench.botScope.allLocked'),
                },
                {
                  value: 'selected',
                  label: t('team.workbench.botScope.selected'),
                  disabled: !view.canSetSelected,
                },
              ]}
              onChange={choose}
            />
          }
        />
        <GroupCaption>{t('team.workbench.bots.title')}</GroupCaption>
        {view.bots.length === 0 ? (
          <SettingsRow title={t('team.workbench.botScope.none')} />
        ) : (
          view.bots.map((bot) => {
            const row = scopeRow(view, current, bot);
            return (
              <SettingsRow
                key={bot.slug}
                icon={<Icon name="bot" />}
                title={
                  bot.availableToMembers ? (
                    bot.displayName
                  ) : (
                    <>
                      {bot.displayName}{' '}
                      <Tag tone="warning">{t('team.workbench.botScope.unavailable')}</Tag>
                    </>
                  )
                }
                description={row.reason === undefined ? undefined : t(row.reason)}
                data={{
                  'data-team-bot-scope-bot': bot.slug,
                  'data-team-bot-scope-on': String(row.on),
                  'data-team-bot-scope-editable': String(row.editable),
                }}
                control={
                  <Switch
                    checked={row.on}
                    label={bot.displayName}
                    disabled={busy || !row.editable}
                    onChange={(on) => toggle(bot.slug, on)}
                  />
                }
              />
            );
          })
        )}
      </SettingsSection>
      {failed ? reloadFailure : null}
      {stale === 'reloaded' ? (
        <Note tone="warning">{t('team.workbench.botScope.stale')}</Note>
      ) : null}
      {error === undefined ? null : <Note tone="danger">{error}</Note>}
      {dirty ? (
        <div {...stylex.props(styles.actions)} data-team-bot-scope-actions="">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setDraft(undefined);
              setStale((value) => (value === 'reloaded' ? 'none' : value));
              setError(undefined);
            }}
          >
            {t('team.workbench.botScope.discard')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || failed || stale === 'reloading'}
            data-team-bot-scope-save=""
            onClick={() => void save()}
          >
            {t('team.save')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
