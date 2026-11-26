import { useRef, useState } from 'react';
import { Keyboard, Platform, View, type ViewInstance } from 'react-native';

import { errorText } from '@botharness/host-client/bot-settings';
import {
  checkTemplate,
  draftFromTemplate,
  type TemplateDraft,
  type TemplateErrors,
} from '@botharness/host-client/shared/voice-template-draft';
import {
  voiceAccessDenied,
  type VoiceKind,
  type VoiceServiceView,
} from '@botharness/host-client/voice-providers';
import type {
  VoiceRequestTemplate,
  VoiceTemplateValidation,
} from '@botharness/host-protocol/voice-request-template';

import { SHEET_GROUP, Sheet, SheetActions, SheetCallout } from '../chat/sheet';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { SheetHeader } from '../primitives/sheet-header';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { Loading } from '../request-parts';
import { useStrings } from '../strings';
import { useTemplateMessages, VoiceTemplateFields } from './voice-template-fields';

export interface VoiceTemplatePort {
  template(id: string): Promise<VoiceRequestTemplate>;
  validate(kind: VoiceKind, template: unknown): Promise<VoiceTemplateValidation>;
  saveTemplate(id: string, template: VoiceRequestTemplate): Promise<VoiceServiceView>;
}

export function VoiceTemplateSheet({
  kind,
  service,
  port,
  onClose,
  onSaved,
}: {
  kind: VoiceKind;
  service: VoiceServiceView;
  port: VoiceTemplatePort;
  onClose(): void;
  onSaved(service: VoiceServiceView): void;
}) {
  const t = useStrings().voiceSettings;
  const messages = useTemplateMessages();
  const [draft, setDraft] = useState<TemplateDraft>();
  const [errors, setErrors] = useState<TemplateErrors>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const failure = (cause: unknown) => (voiceAccessDenied(cause) ? t.ownerOnly : errorText(cause));
  const mount = useMounted<ViewInstance>(() => {
    let live = true;
    port.template(service.id).then(
      (template) => {
        if (live) setDraft(draftFromTemplate(template));
      },
      (cause: unknown) => {
        if (live) setError(failure(cause));
      },
    );
    return () => {
      live = false;
    };
  }, [port, service.id]);
  const close = () => {
    if (pending.current) return;
    Keyboard.dismiss();
    onClose();
  };
  const save = () => {
    if (draft === undefined || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    Keyboard.dismiss();
    checkTemplate(port.validate, kind, draft, messages)
      .then(async (checked) => {
        setErrors(checked.ok ? {} : checked.errors);
        if (!checked.ok) {
          setError(checked.errors.form);
          return undefined;
        }
        return port.saveTemplate(service.id, checked.template);
      })
      .then(
        (saved) => {
          pending.current = false;
          setBusy(false);
          if (saved !== undefined) onSaved(saved);
        },
        (cause: unknown) => {
          pending.current = false;
          setBusy(false);
          setError(failure(cause));
        },
      );
  };
  return (
    <Sheet visible label={t.template.edit} onClose={close} avoidKeyboard fill>
      <View ref={mount} testID="voice-template-edit" style={{ flexShrink: 1 }}>
        <SheetHeader
          {...(Platform.OS === 'android'
            ? { title: t.template.edit, subtitle: service.name }
            : { title: t.template.editTitle(service.name) })}
          onClose={close}
        />
        <KeyboardFormScroll nestedScrollEnabled>
          {draft === undefined ? (
            error === undefined ? (
              <Loading />
            ) : null
          ) : (
            <View style={{ gap: space.x4 }}>
              <VoiceTemplateFields
                kind={kind}
                draft={draft}
                errors={errors}
                onChange={busy ? ignore : setDraft}
              />
            </View>
          )}
          {error === undefined ? null : (
            <View style={{ paddingTop: space.x4 }}>
              <SheetCallout tone="danger">{error}</SheetCallout>
            </View>
          )}
          <SheetActions>
            <Button
              testID="voice-template-save"
              label={busy ? t.template.saving : t.template.save}
              tone="primary"
              busy={busy}
              on={SHEET_GROUP}
              disabled={draft === undefined || draft.url.trim() === ''}
              onPress={save}
            />
          </SheetActions>
        </KeyboardFormScroll>
      </View>
    </Sheet>
  );
}

function ignore(): void {}
