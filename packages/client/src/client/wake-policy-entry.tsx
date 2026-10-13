import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, IconInfoOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import type { BotSourcePolicyEdit, BotSourcePolicyView } from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { Combobox } from './combobox.js';
import { Field, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { space } from './ds/tokens.stylex.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { editable, rule, SourcePolicyDetails, sourceName } from './source-policy.js';

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    minWidth: 0,
  },
  pair: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: space.x4,
  },
});

const policiesBySlug = new Map<string, readonly BotSourcePolicyView[]>();
const policyListeners = new Set<() => void>();

function rememberPolicies(slug: string, policies: readonly BotSourcePolicyView[]): void {
  policiesBySlug.set(slug, policies);
  for (const listener of policyListeners) listener();
}

function subscribePolicies(listener: () => void): () => void {
  policyListeners.add(listener);
  return () => policyListeners.delete(listener);
}

const SOURCE_ICON: Record<BotSourcePolicyView['sourceClass'], string> = {
  'human-dm': 'user',
  'bot-dm': 'bot',
  'group-mention': 'users',
  'group-ordinary': 'messages-square',
  'group-invite': 'users',
  'group-join-request': 'users',
  'group-join-decision': 'users',
  'assignment-report': 'list-checks',
  'assignment-lifecycle': 'list-checks',
};

function SourcePolicyEditModal({
  slug,
  policy,
  actions,
  t,
  onClose,
  onSaved,
}: {
  slug: string;
  policy: BotSourcePolicyView & { sourceClass: BotSourcePolicyEdit['sourceClass'] };
  actions: Pick<BridgeActions, 'botSourcePolicies' | 'setBotSourcePolicy' | 'resetBotSourcePolicy'>;
  t: BotHarnessTranslate;
  onClose(): void;
  onSaved(policies: BotSourcePolicyView[]): void;
}): ReactElement {
  const sourceClass = policy.sourceClass;
  const [wakeDraft, setWakeDraft] = useState<BotSourcePolicyView['wake']>(policy.wake);
  const [deliveryDraft, setDeliveryDraft] = useState<'steer' | 'turn'>(policy.delivery);
  const [digestCountDraft, setDigestCountDraft] = useState(policy.digestCount ?? 5);
  const [digestIntervalDraft, setDigestIntervalDraft] = useState(
    policy.digestIntervalSeconds ?? 30,
  );
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const generation = useRef(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const current = ++generation.current;
    return () => {
      if (generation.current === current) ++generation.current;
    };
  }, [slug, sourceClass]);

  const change = async (reset: boolean): Promise<void> => {
    if (busy) return;
    if (
      !reset &&
      sourceClass === 'group-ordinary' &&
      (!Number.isSafeInteger(digestCountDraft) ||
        digestCountDraft < 1 ||
        digestCountDraft > 100 ||
        !Number.isSafeInteger(digestIntervalDraft) ||
        digestIntervalDraft < 1 ||
        digestIntervalDraft > 3600)
    ) {
      setSaveError(true);
      return;
    }
    setBusy(true);
    setSaveError(false);
    const version = generation.current;
    const current = (): boolean => generation.current === version;
    try {
      if (reset) await actions.resetBotSourcePolicy(slug, sourceClass);
      else if (sourceClass === 'assignment-report') {
        if (wakeDraft !== 'conditional' && wakeDraft !== 'immediate')
          throw new Error('Invalid Assignment report wake');
        await actions.setBotSourcePolicy(slug, {
          sourceClass: 'assignment-report',
          wake: wakeDraft,
        });
      } else if (
        sourceClass === 'human-dm' ||
        sourceClass === 'bot-dm' ||
        sourceClass === 'group-mention'
      ) {
        await actions.setBotSourcePolicy(slug, {
          sourceClass,
          wake: 'immediate',
          delivery: deliveryDraft,
        });
      } else {
        if (
          wakeDraft !== 'immediate' &&
          wakeDraft !== 'digest' &&
          wakeDraft !== 'mentions' &&
          wakeDraft !== 'silent'
        )
          throw new Error('Invalid ordinary Group wake');
        await actions.setBotSourcePolicy(slug, {
          sourceClass: 'group-ordinary',
          wake: wakeDraft,
          digestCount: digestCountDraft,
          digestIntervalSeconds: digestIntervalDraft,
        });
      }
      if (!current()) return;
      const policies = await actions.botSourcePolicies(slug);
      if (!current()) return;
      onSaved(policies);
    } catch {
      if (current()) setSaveError(true);
    } finally {
      if (current()) setBusy(false);
    }
  };

  const immediate =
    sourceClass === 'human-dm' || sourceClass === 'bot-dm' || sourceClass === 'group-mention';
  const wakeLabel = t(
    sourceClass === 'group-ordinary' ? 'sourcePolicy.groupEditTitle' : 'sourcePolicy.editTitle',
  );
  return (
    <FormDialog
      title={t(
        sourceClass === 'group-ordinary'
          ? 'sourcePolicy.groupEditTitle'
          : sourceClass === 'assignment-report'
            ? 'sourcePolicy.editTitle'
            : 'sourcePolicy.immediateEditTitle',
      )}
      description={t(
        sourceClass === 'group-ordinary'
          ? 'sourcePolicy.groupEditDescription'
          : sourceClass === 'assignment-report'
            ? 'sourcePolicy.editDescription'
            : 'sourcePolicy.immediateEditDescription',
      )}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('profile.save')}
      busy={busy}
      error={saveError ? t('sourcePolicy.saveFailed') : undefined}
      onCancel={onClose}
      onSubmit={() => void change(false)}
      secondary={
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void change(true)}>
          {t('sourcePolicy.reset')}
        </Button>
      }
    >
      <div ref={mount} {...stylex.props(styles.stack)}>
        <Field label={sourceName(policy, t)}>
          {() =>
            immediate ? (
              <Combobox
                searchable={false}
                label={t('sourcePolicy.immediateEditTitle')}
                toggleLabel={t('sourcePolicy.immediateEditTitle')}
                value={deliveryDraft}
                disabled={busy}
                options={[
                  { value: 'steer', label: t('sourcePolicy.deliverySteerOption') },
                  { value: 'turn', label: t('sourcePolicy.deliveryTurnOption') },
                ]}
                onSelect={(value) => setDeliveryDraft(value === 'turn' ? 'turn' : 'steer')}
              />
            ) : (
              <Combobox
                searchable={false}
                label={wakeLabel}
                toggleLabel={wakeLabel}
                value={wakeDraft}
                disabled={busy}
                options={
                  sourceClass === 'assignment-report'
                    ? [
                        { value: 'conditional', label: t('sourcePolicy.conditionalOption') },
                        { value: 'immediate', label: t('sourcePolicy.immediateOption') },
                      ]
                    : [
                        { value: 'immediate', label: t('sourcePolicy.groupAllOption') },
                        { value: 'digest', label: t('sourcePolicy.groupDigestOption') },
                        { value: 'mentions', label: t('sourcePolicy.groupMentionsOption') },
                        { value: 'silent', label: t('sourcePolicy.groupSilentOption') },
                      ]
                }
                onSelect={(value) => setWakeDraft(value as BotSourcePolicyView['wake'])}
              />
            )
          }
        </Field>
        {sourceClass === 'group-ordinary' && wakeDraft === 'digest' && (
          <div {...stylex.props(styles.pair)}>
            <TextField
              label={t('sourcePolicy.digestCount')}
              type="number"
              min={1}
              max={100}
              value={String(digestCountDraft)}
              disabled={busy}
              onChange={(value) => setDigestCountDraft(Number(value))}
            />
            <TextField
              label={t('sourcePolicy.digestInterval')}
              type="number"
              min={1}
              max={3600}
              value={String(digestIntervalDraft)}
              disabled={busy}
              onChange={(value) => setDigestIntervalDraft(Number(value))}
            />
          </div>
        )}
      </div>
    </FormDialog>
  );
}

export function WakePolicyEntry({
  botSlug,
  actions,
  t,
  refreshRevision,
}: ChannelSidebarEntryProps): ReactElement {
  const [policies, setPolicies] = useState<readonly BotSourcePolicyView[]>();
  const [loadError, setLoadError] = useState(false);
  const [editingClass, setEditingClass] = useState<BotSourcePolicyView['sourceClass']>();
  const [detailsClass, setDetailsClass] = useState<BotSourcePolicyView['sourceClass']>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    setEditingClass(undefined);
    setDetailsClass(undefined);
    setLoadError(false);
    setPolicies(botSlug === undefined ? undefined : policiesBySlug.get(botSlug));
    if (botSlug === undefined) return;
    void actions.botSourcePolicies(botSlug).then(
      (value) => {
        if (!active) return;
        rememberPolicies(botSlug, value);
        setPolicies(value);
      },
      () => {
        if (active) setLoadError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [actions, botSlug, refreshRevision]);
  const editing = policies?.find((policy) => policy.sourceClass === editingClass);
  const details = policies?.find((policy) => policy.sourceClass === detailsClass);
  return (
    <div ref={mount} className="bh-wake-policy-entry">
      {loadError ? (
        <div className="bh-error" role="alert">
          {t('sourcePolicy.error')}
        </div>
      ) : policies === undefined ? (
        <LoadingSkeleton kind="sidebar" label={t('sourcePolicy.loading')} />
      ) : (
        <SidebarCardList label={t('sourcePolicy.defaults')}>
          {policies.map((policy) => {
            const name = sourceName(policy, t);
            const canEdit = editable(policy);
            return (
              <SidebarCardRow
                key={policy.sourceClass}
                icon={SOURCE_ICON[policy.sourceClass]}
                title={name}
                meta={
                  canEdit
                    ? rule(policy, t, true)
                    : `${rule(policy, t, true)} · ${t('sourcePolicy.readOnly')}`
                }
                chips={
                  canEdit && policy.overrideActive ? (
                    <Tag tone="info">{t('sourcePolicy.customized')}</Tag>
                  ) : undefined
                }
                muted={!canEdit}
                hint={canEdit ? t('sourcePolicy.editFor', { source: name }) : undefined}
                dialog
                onClick={() =>
                  canEdit
                    ? setEditingClass(policy.sourceClass)
                    : setDetailsClass(policy.sourceClass)
                }
                trailing={
                  <button
                    type="button"
                    className="bh-icon-btn bh-source-policy-action"
                    aria-label={t('sourcePolicy.detailsFor', { source: name })}
                    title={t('sourcePolicy.detailsFor', { source: name })}
                    onClick={() => setDetailsClass(policy.sourceClass)}
                  >
                    <IconInfoOutlineRegular size={14} />
                  </button>
                }
              />
            );
          })}
        </SidebarCardList>
      )}
      {editing !== undefined && botSlug !== undefined && editable(editing) && (
        <SourcePolicyEditModal
          key={`${botSlug}:${editing.sourceClass}`}
          slug={botSlug}
          policy={editing}
          actions={actions}
          t={t}
          onClose={() => setEditingClass(undefined)}
          onSaved={(value) => {
            rememberPolicies(botSlug, value);
            setPolicies(value);
            setEditingClass(undefined);
          }}
        />
      )}
      {details !== undefined && (
        <SourcePolicyDetails policy={details} t={t} onClose={() => setDetailsClass(undefined)} />
      )}
    </div>
  );
}

export function WakePolicyBadge({ botSlug, actions, t }: ChannelSidebarEntryProps): ReactElement {
  const snapshot = (): readonly BotSourcePolicyView[] | undefined =>
    botSlug === undefined ? undefined : policiesBySlug.get(botSlug);
  const policies = useSyncExternalStore(subscribePolicies, snapshot, snapshot);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    if (botSlug === undefined || policiesBySlug.has(botSlug)) return;
    let active = true;
    void actions.botSourcePolicies(botSlug).then(
      (value: readonly BotSourcePolicyView[] | undefined) => {
        if (active) rememberPolicies(botSlug, value ?? []);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [actions, botSlug]);
  const ordinary = policies?.find((policy) => policy.sourceClass === 'group-ordinary');
  return (
    <span ref={mount} className="bh-channel-sidebar-summary">
      {ordinary === undefined ? null : (
        <Tag tone="neutral">{t('sourcePolicy.badge', { rule: rule(ordinary, t, true) })}</Tag>
      )}
    </span>
  );
}
