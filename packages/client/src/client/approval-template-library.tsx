import {
  decodeApprovalTemplateGuidance,
  encodeApprovalTemplateGuidance,
  type ApprovalTemplateGuidance,
} from '../../../core/src/workspaces/approval-template-guidance.js';
import type { ApprovalTemplateDeletionPreview } from '../../../core/src/workspaces/approval-template-deletion-contract.js';
import { useClientFields, useStoreSlice } from './use-client-store.js';
import { useRef, useState, type ReactElement } from 'react';
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import * as stylex from '@stylexjs/stylex';

import { templateDescription, templateTitle } from './approval-template-entry.js';
import {
  BridgeCallError,
  createApprovalTemplate,
  deleteApprovalTemplate,
  errorMessage,
  loadApprovalTemplates,
  previewApprovalTemplateDeletion,
  setGlobalApprovalTemplate,
  setBotApprovalTemplate,
  updateApprovalTemplate,
  type ApprovalTemplateView,
  type BridgeCall,
} from './bridge.js';
import { Callout } from './ds/callout.js';
import { Field, FieldStack, TextAreaField, TextField } from './ds/field.js';
import { ConfirmDialog, DangerTextButton, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { border, color, space, text } from './ds/tokens.stylex.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import type { BotHarnessTranslate } from './locale.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import type { ClientState, ClientStore } from './store.js';

function currentTemplateBot(state: ClientState): string | undefined {
  const selection = state.selection;
  if (selection?.kind === 'bot') return selection.slug;
  if (selection?.kind === 'channel')
    return state.channels.find((channel) => channel.id === selection.channelId)?.botSlug;
  return undefined;
}

const TEMPLATE_LIBRARY_FIELDS = ['bots'] as const;

const NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

const styles = stylex.create({
  meta: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.x2 },
  ruleInput: {
    boxSizing: 'border-box',
    width: '100%',
    minWidth: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    fontWeight: text.regular,
    outlineStyle: 'solid',
    outlineWidth: border.focus,
    outlineColor: { default: 'transparent', ':focus-within': color.fg },
    outlineOffset: -2,
  },
});

type Editor =
  | { mode: 'source' }
  | { mode: 'create'; name: string; text: string }
  | { mode: 'view'; template: ApprovalTemplateView }
  | { mode: 'edit'; template: ApprovalTemplateView; text: string };

function botNames(store: ClientStore, slugs: readonly string[]): string {
  const names = new Map(store.getSnapshot().bots.map((bot) => [bot.slug, bot.displayName]));
  return slugs.map((slug) => names.get(slug) ?? slug).join(', ');
}

type Deleting = { template: ApprovalTemplateView } & (
  | { kind: 'loading' | 'failed' }
  | { kind: 'ready'; preview: ApprovalTemplateDeletionPreview }
);

function copyName(name: string, taken: readonly ApprovalTemplateView[]): string {
  const base = (name + '-copy').slice(0, 58);
  let candidate = base;
  for (let index = 2; taken.some((template) => template.name === candidate); index++)
    candidate = base + '-' + String(index);
  return candidate;
}

function GuidanceFields({
  text,
  onChange,
  t,
}: {
  text: string;
  onChange(text: string): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const parts = decodeApprovalTemplateGuidance(text);
  const update = (next: ApprovalTemplateGuidance): void =>
    onChange(encodeApprovalTemplateGuidance(next));
  return (
    <FieldStack>
      <Note>{t('autoApproval.library.guidanceHint')}</Note>
      {(['alwaysAsk', 'alwaysAllow'] as const).map((key) => {
        const label = t(
          key === 'alwaysAsk'
            ? 'autoApproval.library.alwaysAsk'
            : 'autoApproval.library.alwaysAllow',
        );
        return (
          <Field key={key} label={label} group>
            {() => (
              <SidebarCardList label={label}>
                {parts[key].map((row, index) => {
                  const rowLabel = label + ' ' + String(index + 1);
                  return (
                    <SidebarCardRow
                      key={index}
                      leading={<span aria-hidden>{index + 1}</span>}
                      title={
                        <Input
                          aria-label={rowLabel}
                          className={stylex.props(styles.ruleInput).className ?? ''}
                          value={row}
                          onChange={(event) =>
                            update({
                              ...parts,
                              [key]: parts[key].map((item, position) =>
                                position === index ? event.currentTarget.value : item,
                              ),
                            })
                          }
                        />
                      }
                      trailing={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={t('autoApproval.library.removeRow') + ' · ' + rowLabel}
                          onClick={() =>
                            update({
                              ...parts,
                              [key]: parts[key].filter((_, position) => position !== index),
                            })
                          }
                        >
                          <ChannelSidebarIcon name="x" size={16} />
                        </Button>
                      }
                    />
                  );
                })}
                <SidebarCardRow
                  icon="plus"
                  title={t('autoApproval.library.addRow', { section: label })}
                  onClick={() => update({ ...parts, [key]: [...parts[key], ''] })}
                />
              </SidebarCardList>
            )}
          </Field>
        );
      })}
      <TextAreaField
        label={t('autoApproval.library.freeText')}
        hint={t('autoApproval.library.freeTextHint')}
        value={parts.freeText}
        rows={8}
        onChange={(freeText) => update({ ...parts, freeText })}
      />
    </FieldStack>
  );
}

export function ApprovalTemplateLibrarySettings({
  call,
  store,
  t,
}: {
  call: BridgeCall;
  store: ClientStore;
  t: BotHarnessTranslate;
}): ReactElement {
  const [globalDefault, setGlobalDefault] = useState<string | null>();
  const [globalError, setGlobalError] = useState(false);
  const [templates, setTemplates] = useState<ApprovalTemplateView[]>();
  const [loadError, setLoadError] = useState<string>();
  const [editor, setEditor] = useState<Editor>();
  const [deleting, setDeleting] = useState<Deleting>();
  const deletionGeneration = useRef(0);
  const reloadGeneration = useRef(0);
  const [applyTo, setApplyTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const { bots } = useClientFields(TEMPLATE_LIBRARY_FIELDS, store);
  const currentBotSlug = useStoreSlice(store, currentTemplateBot);
  const currentBot = bots.find((bot) => bot.slug === currentBotSlug);

  const reload = async () => {
    const generation = ++reloadGeneration.current;
    const result = await loadApprovalTemplates(call).then(
      (value) => ({ kind: 'loaded' as const, value }),
      (cause: unknown) => ({ kind: 'failed' as const, cause }),
    );
    if (generation !== reloadGeneration.current) return { kind: 'superseded' as const, result };
    if (result.kind === 'failed') throw result.cause;
    const next = result.value;
    setTemplates(next.templates);
    setGlobalDefault(next.globalDefault ?? null);
    setGlobalError(false);
    setLoadError(undefined);
    setEditor((current) =>
      current !== undefined &&
      (current.mode === 'view' || current.mode === 'edit') &&
      !next.templates.some((template) => template.name === current.template.name)
        ? undefined
        : current,
    );
    return result;
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    void reload().catch((cause: unknown) => {
      if (live) setLoadError(errorMessage(cause));
    });
    return () => {
      live = false;
      reloadGeneration.current++;
      deletionGeneration.current++;
    };
  }, [call]);

  const updateGlobal = (
    action: { kind: 'reload' } | { kind: 'select'; name: string | null },
  ): void => {
    if (busy) return;
    setBusy(true);
    setGlobalError(false);
    const operation =
      action.kind === 'reload'
        ? reload()
        : setGlobalApprovalTemplate(call, action.name).then(reload);
    void operation
      .catch(() => {
        setGlobalDefault(undefined);
        setGlobalError(true);
      })
      .finally(() => setBusy(false));
  };

  const cancelDeletion = (): void => {
    deletionGeneration.current++;
    setDeleting(undefined);
    setError(undefined);
  };
  const close = (): void => {
    setEditor(undefined);
    setApplyTo('');
    cancelDeletion();
    setError(undefined);
  };
  const createDraft = (draft: Extract<Editor, { mode: 'create' }>): void => {
    setApplyTo('');
    setError(undefined);
    setEditor(draft);
  };
  const run = (operation: () => Promise<unknown>): void => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    void operation()
      .then(async () => {
        close();
        await reload();
      })
      .catch(async (cause: unknown) => {
        setError(errorMessage(cause));
        setTemplates(undefined);
        setGlobalDefault(undefined);
        setGlobalError(true);
        try {
          await reload();
        } catch (readCause: unknown) {
          setLoadError(errorMessage(readCause));
        }
      })
      .finally(() => setBusy(false));
  };

  const beginDeletion = (template: ApprovalTemplateView, notice?: string): void => {
    const generation = ++deletionGeneration.current;
    setError(notice);
    setDeleting({ template, kind: 'loading' });
    void previewApprovalTemplateDeletion(call, template.name).then(
      (preview) => {
        if (deletionGeneration.current === generation)
          setDeleting({ template, kind: 'ready', preview });
      },
      async (cause: unknown) => {
        if (deletionGeneration.current !== generation) return;
        if (cause instanceof BridgeCallError && cause.code === 'unknown-template') {
          try {
            const next = await reload();
            if (deletionGeneration.current === generation) {
              if (next.kind === 'loaded') cancelDeletion();
              else {
                setDeleting({ template, kind: 'failed' });
                setError(t('autoApproval.library.deletePreviewFailed'));
              }
            }
          } catch (readCause: unknown) {
            if (deletionGeneration.current !== generation) return;
            setTemplates(undefined);
            setGlobalDefault(undefined);
            setGlobalError(true);
            setLoadError(errorMessage(readCause));
            setEditor(undefined);
            setDeleting({ template, kind: 'failed' });
            setError(t('autoApproval.library.deletePreviewFailed'));
          }
          return;
        }
        setDeleting({ template, kind: 'failed' });
        setError(t('autoApproval.library.deletePreviewFailed'));
      },
    );
  };
  const reconcileDeletion = async (name: string, generation: number): Promise<void> => {
    try {
      const next = await reload();
      if (next.kind === 'superseded') return;
      if (
        deletionGeneration.current === generation &&
        !next.value.templates.some((template) => template.name === name)
      ) {
        try {
          await previewApprovalTemplateDeletion(call, name);
        } catch (cause: unknown) {
          if (
            deletionGeneration.current === generation &&
            cause instanceof BridgeCallError &&
            cause.code === 'unknown-template'
          )
            cancelDeletion();
        }
      }
    } catch {
      setGlobalDefault(undefined);
      setGlobalError(true);
    }
  };
  const recoverDeletion = (template: ApprovalTemplateView): void => {
    if (busy) return;
    const generation = deletionGeneration.current;
    setBusy(true);
    void reload()
      .then((next) => {
        if (next.kind === 'loaded' && deletionGeneration.current === generation)
          beginDeletion(template);
      })
      .catch(() => {
        setGlobalDefault(undefined);
        setGlobalError(true);
      })
      .finally(() => setBusy(false));
  };
  const confirmDeletion = (): void => {
    if (busy || deleting?.kind !== 'ready') return;
    const selected = deleting;
    const generation = deletionGeneration.current;
    setBusy(true);
    setError(undefined);
    void deleteApprovalTemplate(call, selected.preview)
      .then(async () => {
        setTemplates((current) =>
          current?.filter((template) => template.name !== selected.preview.name),
        );
        if (deletionGeneration.current === generation) close();
        await reconcileDeletion(selected.preview.name, generation);
      })
      .catch(async (cause: unknown) => {
        if (deletionGeneration.current === generation) {
          if (cause instanceof BridgeCallError && cause.code === 'approval-template-delete-changed')
            beginDeletion(selected.template, t('autoApproval.library.deleteChanged'));
          else {
            setDeleting({ template: selected.template, kind: 'failed' });
            setError(t('autoApproval.library.deleteUnconfirmed'));
          }
        }
        setGlobalDefault(undefined);
        setGlobalError(true);
        await reconcileDeletion(selected.preview.name, generation);
      })
      .finally(() => setBusy(false));
  };

  const labels = { close: t('common.close'), cancel: t('common.cancel') };
  const list = templates ?? [];
  const usedBy = (template: ApprovalTemplateView): string | undefined =>
    template.usedBy.length === 0 ? undefined : botNames(store, template.usedBy);

  const dialog = (() => {
    if (deleting !== undefined) {
      const preview = deleting.kind === 'ready' ? deleting.preview : undefined;
      const direct =
        preview?.affectedBots.filter((bot) => bot.source === 'specific').map((bot) => bot.slug) ??
        [];
      const inherited =
        preview?.affectedBots.filter((bot) => bot.source === 'global').map((bot) => bot.slug) ?? [];
      const after = preview?.globalDefaultAfter;
      const effective =
        after === null
          ? t('autoApproval.off')
          : after === undefined
            ? ''
            : preview?.globalDefaultAvailable
              ? templateTitle(t, after, list.find((template) => template.name === after)?.title)
              : t('autoApproval.templateMissing', { name: after });
      return (
        <ConfirmDialog
          title={t('autoApproval.library.deleteTitle', {
            title: templateTitle(t, deleting.template.name, deleting.template.title),
          })}
          labels={labels}
          confirmLabel={t('autoApproval.library.delete')}
          confirmDisabled={preview === undefined}
          scroll
          busy={busy}
          error={error}
          onCancel={cancelDeletion}
          onConfirm={confirmDeletion}
        >
          <Note>{t('autoApproval.library.deleteBody', { name: deleting.template.name })}</Note>
          {deleting.kind === 'loading' ? <Note>{t('autoApproval.loading')}</Note> : null}
          {preview === undefined ? null : (
            <>
              {preview.contentUnavailable ? (
                <Callout tone="warning">
                  {t('autoApproval.library.deleteContentUnavailable')}
                </Callout>
              ) : null}
              {direct.length === 0 ? null : (
                <Callout tone="warning">
                  {t('autoApproval.library.deleteDirect', { names: botNames(store, direct) })}
                </Callout>
              )}
              {inherited.length === 0 ? null : (
                <Callout tone="warning">
                  {t('autoApproval.library.deleteInherited', { names: botNames(store, inherited) })}
                </Callout>
              )}
              {preview.globalDefaultBefore === preview.name ? (
                <Note>{t('autoApproval.library.deleteClearsGlobal')}</Note>
              ) : null}
              {preview.hiddenBotCount > 0 ? (
                <Callout tone="warning">
                  {t('autoApproval.library.deleteHidden', {
                    count: String(preview.hiddenBotCount),
                  })}
                </Callout>
              ) : null}
              {preview.affectedBots.length === 0 && preview.hiddenBotCount === 0 ? (
                <Note>{t('autoApproval.library.deleteUnused')}</Note>
              ) : (
                <Note>{t('autoApproval.library.deleteEffective', { template: effective })}</Note>
              )}
              <Note>{t('autoApproval.library.deleteRulesUnchanged')}</Note>
            </>
          )}
          {deleting.kind === 'failed' ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => recoverDeletion(deleting.template)}
            >
              {t('autoApproval.reload')}
            </Button>
          ) : null}
        </ConfirmDialog>
      );
    }
    if (editor === undefined) return null;
    if (editor.mode === 'source')
      return (
        <FormDialog
          title={t('autoApproval.library.createTitle')}
          labels={labels}
          submitLabel=""
          onCancel={close}
        >
          <Select
            label={t('autoApproval.library.source')}
            value="@choose"
            options={[
              { value: '@choose', label: t('autoApproval.library.chooseSource') },
              { value: '@blank', label: t('autoApproval.library.blank') },
              ...list.map((template) => ({
                value: template.name,
                label: template.builtIn
                  ? templateTitle(t, template.name, template.title)
                  : templateTitle(t, template.name, template.title) + ' · ' + template.name,
              })),
            ]}
            onChange={(source) => {
              if (source === '@choose') return;
              const template = list.find((item) => item.name === source);
              createDraft({
                mode: 'create',
                name: template === undefined ? '' : copyName(template.name, list),
                text:
                  template?.text ??
                  encodeApprovalTemplateGuidance({ alwaysAsk: [], alwaysAllow: [], freeText: '' }),
              });
            }}
          />
        </FormDialog>
      );
    const saveChoice = (
      <Select
        label={t('autoApproval.library.saveChoice')}
        value={applyTo}
        disabled={busy}
        options={[
          { value: '', label: t('autoApproval.library.saveOnly') },
          ...(currentBot === undefined
            ? []
            : [
                {
                  value: currentBot.slug,
                  label: t('autoApproval.library.saveApply', { name: currentBot.displayName }),
                },
              ]),
        ]}
        onChange={setApplyTo}
      />
    );
    const apply = async (name: string): Promise<void> => {
      if (applyTo !== '') await setBotApprovalTemplate(call, applyTo, name);
    };
    if (editor.mode === 'create') {
      const nameProblem =
        editor.name !== '' && !NAME.test(editor.name)
          ? t('autoApproval.library.nameHint')
          : undefined;
      return (
        <FormDialog
          title={t('autoApproval.library.createTitle')}
          size="wide"
          scroll
          labels={labels}
          submitLabel={t('autoApproval.library.createSubmit')}
          submitData={{ 'data-approval-template-submit': 'create' }}
          submitDisabled={!NAME.test(editor.name) || editor.text.trim() === ''}
          busy={busy}
          error={error}
          onCancel={close}
          onSubmit={() =>
            run(async () => {
              const template = await createApprovalTemplate(call, editor.name, {
                text: editor.text,
              });
              setEditor({ mode: 'edit', template, text: editor.text });
              await apply(editor.name);
            })
          }
        >
          <FieldStack>
            <TextField
              label={t('autoApproval.library.name')}
              hint={nameProblem === undefined ? t('autoApproval.library.nameHint') : undefined}
              error={nameProblem}
              value={editor.name}
              monospace
              initialFocus
              spellCheck={false}
              autoComplete="off"
              onChange={(name) => setEditor({ ...editor, name: name.trim() })}
            />
            <GuidanceFields
              text={editor.text}
              onChange={(text) => setEditor({ ...editor, text })}
              t={t}
            />
            {saveChoice}
          </FieldStack>
        </FormDialog>
      );
    }
    const template = editor.template;
    const title = templateTitle(t, template.name, template.title);
    if (editor.mode === 'view')
      return (
        <FormDialog
          title={title}
          size="wide"
          scroll
          labels={labels}
          submitLabel={t('autoApproval.library.copy')}
          submitData={{ 'data-approval-template-submit': 'copy' }}
          onCancel={close}
          onSubmit={() =>
            createDraft({
              mode: 'create',
              name: copyName(template.name, list),
              text: template.text ?? '',
            })
          }
        >
          <Note>{t('autoApproval.library.readOnly')}</Note>
          <TextAreaField
            label={t('autoApproval.library.text')}
            value={template.text ?? ''}
            rows={16}
            readOnly
            onChange={() => {}}
          />
        </FormDialog>
      );
    const names = usedBy(template);
    return (
      <FormDialog
        title={t('autoApproval.library.editTitle', { title })}
        size="wide"
        scroll
        labels={labels}
        submitLabel={t('autoApproval.library.save')}
        submitData={{ 'data-approval-template-submit': 'save' }}
        submitDisabled={
          editor.text.trim() === '' || (editor.text === template.text && applyTo === '')
        }
        busy={busy}
        error={error}
        onCancel={close}
        onSubmit={() =>
          run(async () => {
            if (editor.text !== template.text) {
              const saved = await updateApprovalTemplate(call, template.name, editor.text);
              setEditor((current) =>
                current?.mode === 'edit' && current.template.name === saved.name
                  ? { ...current, template: saved }
                  : current,
              );
            }
            await apply(template.name);
          })
        }
        secondary={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                createDraft({
                  mode: 'create',
                  name: copyName(template.name, list),
                  text: editor.text,
                })
              }
            >
              {t('autoApproval.library.copy')}
            </Button>
            <DangerTextButton
              disabled={busy}
              onClick={() => {
                setError(undefined);
                beginDeletion(template);
              }}
            >
              {t('autoApproval.library.delete')}
            </DangerTextButton>
          </>
        }
      >
        {names === undefined ? null : (
          <Callout tone="muted">{t('autoApproval.library.inUse', { names })}</Callout>
        )}
        <GuidanceFields
          text={editor.text}
          onChange={(text) => setEditor({ ...editor, text })}
          t={t}
        />
        {saveChoice}
      </FormDialog>
    );
  })();

  return (
    <div ref={mount} data-approval-template-library="">
      <SettingsSection
        title={t('autoApproval.library.title')}
        description={t('autoApproval.library.description')}
      >
        {templates === undefined ? null : (
          <SettingsRow
            title={t('autoApproval.globalDefault')}
            description={
              globalError ? (
                <Note tone="danger">{t('autoApproval.globalUnknown')}</Note>
              ) : globalDefault !== undefined &&
                globalDefault !== null &&
                !list.some((template) => template.name === globalDefault) ? (
                t('autoApproval.unavailable')
              ) : undefined
            }
            control={
              <>
                <Select
                  label={t('autoApproval.globalDefault')}
                  value={globalDefault === undefined ? '@unknown' : (globalDefault ?? '@off')}
                  disabled={busy || globalDefault === undefined}
                  options={[
                    ...(globalDefault === undefined
                      ? [{ value: '@unknown', label: t('autoApproval.unreadable') }]
                      : globalDefault !== null &&
                          !list.some((template) => template.name === globalDefault)
                        ? [
                            {
                              value: globalDefault,
                              label: t('autoApproval.templateMissing', { name: globalDefault }),
                            },
                          ]
                        : []),
                    { value: '@off', label: t('autoApproval.off') },
                    ...list.map((template) => ({
                      value: template.name,
                      label: templateTitle(t, template.name, template.title),
                    })),
                  ]}
                  onChange={(value) =>
                    updateGlobal({ kind: 'select', name: value === '@off' ? null : value })
                  }
                />
                {globalError ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => updateGlobal({ kind: 'reload' })}
                  >
                    {t('autoApproval.reload')}
                  </Button>
                ) : null}
              </>
            }
          />
        )}
        <SettingsRow
          title={t('autoApproval.library.new')}
          data={{ 'data-approval-template-new': '' }}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={templates === undefined}
              onClick={() => setEditor({ mode: 'source' })}
            >
              {t('autoApproval.library.create')}
            </Button>
          }
        />
        {templates === undefined ? (
          loadError === undefined ? (
            <LoadingSkeleton kind="sidebar" label={t('autoApproval.library.title')} />
          ) : (
            <ReadFailure
              retryLabel={t('autoApproval.reload')}
              busy={busy}
              onRetry={() => updateGlobal({ kind: 'reload' })}
            >
              {loadError}
            </ReadFailure>
          )
        ) : (
          list.map((template) => {
            const names = usedBy(template);
            return (
              <SettingsRow
                key={template.name}
                title={templateTitle(t, template.name, template.title)}
                data={{ 'data-approval-template': template.name }}
                description={
                  <span {...stylex.props(styles.meta)}>
                    {template.builtIn ? (
                      <Tag tone="neutral">{t('autoApproval.library.builtIn')}</Tag>
                    ) : (
                      <Tag tone="neutral">{template.name}</Tag>
                    )}
                    <span>
                      {[
                        templateDescription(t, template),
                        names === undefined
                          ? t('autoApproval.library.unused')
                          : t('autoApproval.library.usedBy', { names }),
                      ]
                        .filter((part) => part !== '')
                        .join(' · ')}
                    </span>
                  </span>
                }
                control={
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={
                      template.builtIn
                        ? t('autoApproval.library.view') +
                          ' · ' +
                          templateTitle(t, template.name, template.title)
                        : t('autoApproval.library.editTitle', {
                            title: templateTitle(t, template.name, template.title),
                          })
                    }
                    onClick={() => {
                      setError(undefined);
                      setEditor(
                        template.builtIn
                          ? { mode: 'view', template }
                          : { mode: 'edit', template, text: template.text ?? '' },
                      );
                    }}
                  >
                    {template.builtIn
                      ? t('autoApproval.library.view')
                      : t('autoApproval.library.edit')}
                  </Button>
                }
              />
            );
          })
        )}
      </SettingsSection>
      {dialog}
    </div>
  );
}
