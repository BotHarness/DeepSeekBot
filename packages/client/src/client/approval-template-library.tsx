import { useState, useSyncExternalStore, type ReactElement } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import * as stylex from '@stylexjs/stylex';

import { templateDescription, templateTitle } from './approval-template-entry.js';
import {
  createApprovalTemplate,
  deleteApprovalTemplate,
  errorMessage,
  loadApprovalTemplates,
  updateApprovalTemplate,
  type ApprovalTemplateView,
  type BridgeCall,
} from './bridge.js';
import { Callout } from './ds/callout.js';
import { FieldStack, TextAreaField, TextField } from './ds/field.js';
import { ConfirmDialog, DangerTextButton, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import type { ClientStore } from './store.js';

const NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

const styles = stylex.create({
  meta: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.x2 },
});

type Editor =
  | { mode: 'create'; name: string; text: string }
  | { mode: 'view'; template: ApprovalTemplateView }
  | { mode: 'edit'; template: ApprovalTemplateView; text: string };

function botNames(store: ClientStore, slugs: readonly string[]): string {
  const bots = store.getSnapshot().bots;
  return slugs.map((slug) => bots.find((bot) => bot.slug === slug)?.displayName ?? slug).join(', ');
}

function copyName(name: string, taken: readonly ApprovalTemplateView[]): string {
  const base = (name + '-copy').slice(0, 58);
  let candidate = base;
  for (let index = 2; taken.some((template) => template.name === candidate); index++)
    candidate = base + '-' + String(index);
  return candidate;
}

function copyText(text: string, suffix: string): string {
  return text.replace(/^(#[ \t]+)(.+)$/mu, (_match, mark: string, title: string) =>
    title.trimEnd().endsWith(suffix) ? mark + title : mark + title.trimEnd() + ' ' + suffix,
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
  const [templates, setTemplates] = useState<ApprovalTemplateView[]>();
  const [loadError, setLoadError] = useState<string>();
  const [editor, setEditor] = useState<Editor>();
  const [deleting, setDeleting] = useState<ApprovalTemplateView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useSyncExternalStore(store.subscribe, store.getSnapshot);

  const reload = async (): Promise<void> => {
    const next = await loadApprovalTemplates(call);
    setTemplates(next.templates);
    setLoadError(undefined);
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    loadApprovalTemplates(call)
      .then((next) => {
        if (live) setTemplates(next.templates);
      })
      .catch((cause: unknown) => {
        if (live) setLoadError(errorMessage(cause));
      });
    return () => {
      live = false;
    };
  }, [call]);

  const close = (): void => {
    setEditor(undefined);
    setDeleting(undefined);
    setError(undefined);
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
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };

  const labels = { close: t('common.close'), cancel: t('common.cancel') };
  const list = templates ?? [];
  const usedBy = (template: ApprovalTemplateView): string | undefined =>
    template.usedBy.length === 0 ? undefined : botNames(store, template.usedBy);

  const dialog = (() => {
    if (deleting !== undefined) {
      const names = usedBy(deleting);
      return (
        <ConfirmDialog
          title={t('autoApproval.library.deleteTitle', {
            title: templateTitle(t, deleting.name, deleting.title),
          })}
          labels={labels}
          confirmLabel={t('autoApproval.library.delete')}
          busy={busy}
          error={error}
          onCancel={() => setDeleting(undefined)}
          onConfirm={() => run(() => deleteApprovalTemplate(call, deleting.name))}
        >
          <Note>{t('autoApproval.library.deleteBody', { name: deleting.name })}</Note>
          {names === undefined ? null : (
            <Callout tone="warning">{t('autoApproval.library.deleteInUse', { names })}</Callout>
          )}
        </ConfirmDialog>
      );
    }
    if (editor === undefined) return null;
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
            run(() => createApprovalTemplate(call, editor.name, { text: editor.text }))
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
            <TextAreaField
              label={t('autoApproval.library.text')}
              hint={t('autoApproval.library.newHint')}
              value={editor.text}
              rows={16}
              onChange={(text) => setEditor({ ...editor, text })}
            />
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
            setEditor({
              mode: 'create',
              name: copyName(template.name, list),
              text: copyText(template.text ?? '', t('autoApproval.library.copySuffix')),
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
        submitDisabled={editor.text.trim() === '' || editor.text === template.text}
        busy={busy}
        error={error}
        onCancel={close}
        onSubmit={() => run(() => updateApprovalTemplate(call, template.name, editor.text))}
        secondary={
          <DangerTextButton
            disabled={busy}
            onClick={() => {
              setError(undefined);
              setDeleting(template);
            }}
          >
            {t('autoApproval.library.delete')}
          </DangerTextButton>
        }
      >
        {names === undefined ? null : (
          <Callout tone="muted">{t('autoApproval.library.inUse', { names })}</Callout>
        )}
        <TextAreaField
          label={t('autoApproval.library.text')}
          hint={t('autoApproval.library.fileHint', { name: template.name })}
          value={editor.text}
          rows={16}
          initialFocus
          onChange={(text) => setEditor({ ...editor, text })}
        />
      </FormDialog>
    );
  })();

  return (
    <div ref={mount} data-approval-template-library="">
      <SettingsSection
        title={t('autoApproval.library.title')}
        description={t('autoApproval.library.description')}
      >
        <SettingsRow
          title={t('autoApproval.library.new')}
          data={{ 'data-approval-template-new': '' }}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={templates === undefined}
              onClick={() => setEditor({ mode: 'create', name: '', text: '' })}
            >
              {t('autoApproval.library.create')}
            </Button>
          }
        />
        {templates === undefined ? (
          loadError === undefined ? (
            <LoadingSkeleton kind="sidebar" label={t('autoApproval.library.title')} />
          ) : (
            <Note tone="danger">{loadError}</Note>
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
