import { useState, type ReactElement } from 'react';

import type { VoiceActions } from '../../actions-voice.js';
import { errorMessage } from '../../bridge.js';
import { FieldStack } from '../../ds/field.js';
import { FormDialog } from '../../ds/form-dialog.js';
import { LoadingSkeleton } from '../../loading-skeleton.js';
import type { BotHarnessTranslate } from '../../locale.js';
import { useMountedResource } from '../../mounted-resource.js';
import {
  draftFromTemplate,
  type TemplateDraft,
  type TemplateErrors,
  type TemplateKind,
} from './template-draft.js';
import { checkTemplate, TemplateFields } from './template-form.js';

type TemplateActions = Required<
  Pick<VoiceActions, 'validateVoiceTemplate' | 'voiceProviderTemplate' | 'setVoiceProviderTemplate'>
>;

export function TemplateEditDialog({
  provider,
  kind,
  actions,
  t,
  onCancel,
  onSaved,
}: {
  readonly provider: { readonly id: string; readonly name: string };
  readonly kind: TemplateKind;
  readonly actions: TemplateActions;
  readonly t: BotHarnessTranslate;
  onCancel(): void;
  onSaved(): void;
}): ReactElement {
  const [draft, setDraft] = useState<TemplateDraft>();
  const [errors, setErrors] = useState<TemplateErrors>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { voiceProviderTemplate } = actions;
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    void voiceProviderTemplate(provider.id)
      .then((template) => {
        if (live) setDraft(draftFromTemplate(template));
      })
      .catch((cause: unknown) => {
        if (live) setFailure(errorMessage(cause));
      });
    return () => {
      live = false;
    };
  }, [voiceProviderTemplate, provider.id]);
  const submit = (): void => {
    if (draft === undefined || busy) return;
    setBusy(true);
    setFailure(undefined);
    void checkTemplate(actions.validateVoiceTemplate, kind, draft, t)
      .then(async (checked) => {
        setErrors(checked.ok ? {} : checked.errors);
        if (!checked.ok) {
          setFailure(checked.errors.form);
          return;
        }
        await actions.setVoiceProviderTemplate(provider.id, checked.template);
        onSaved();
      })
      .catch((cause: unknown) => setFailure(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  return (
    <FormDialog
      title={t('voice.template.editTitle', { name: provider.name })}
      size="medium"
      scroll
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('voice.template.save')}
      submitData={{ 'data-voice-template-save': provider.id }}
      submitDisabled={draft === undefined}
      busy={busy}
      error={failure}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <div ref={mount} data-voice-template-edit={provider.id}>
        {draft === undefined ? (
          failure === undefined ? (
            <LoadingSkeleton kind="sidebar" label={t('voice.template.edit')} />
          ) : null
        ) : (
          <FieldStack>
            <TemplateFields kind={kind} draft={draft} errors={errors} t={t} onChange={setDraft} />
          </FieldStack>
        )}
      </div>
    </FormDialog>
  );
}
