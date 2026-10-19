import { Text } from './primitives/system-text';
import { TextField } from './primitives/text-field';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View, type ViewInstance } from 'react-native';

import {
  buildAnswer,
  emptyDraft,
  toggleOption,
  typeCustom,
  type DecisionResult,
  type QuestionDraft,
  type QuestionRequest,
} from '../host/requests';
import type { QuestionAnswer, QuestionItem } from '../host/wire';
import {
  ActionButton,
  errorText,
  LoadFailed,
  Loading,
  Notice,
  type NoticeTone,
} from './request-parts';
import { useMounted } from './mounted';
import { KeyboardFormScroll } from './primitives/keyboard-form';
import { haptic } from './haptics';
import { t } from './strings';
import { useTheme } from './theme';

export interface QuestionPort {
  load(): Promise<QuestionRequest>;
  answer(answer: QuestionAnswer): Promise<DecisionResult>;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'failed'; error: string }
  | {
      kind: 'ready';
      request: QuestionRequest;
      busy?: boolean;
      notice?: { tone: NoticeTone; text: string };
    };

function settledNotice(status: QuestionRequest['status']) {
  if (status === 'expired') return { tone: 'warning' as const, text: t.expired };
  if (status === 'decided') return { tone: 'warning' as const, text: t.alreadyAnswered };
  return undefined;
}

export function QuestionView({
  port,
  botName,
  listed = true,
}: {
  port: QuestionPort;
  botName: string;
  listed?: boolean;
}) {
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({});
  const own = useRef(false);

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const request = await port.load();
      const notice = settledNotice(request.status);
      setPhase({ kind: 'ready', request, ...(notice === undefined ? {} : { notice }) });
    } catch (error) {
      setPhase({ kind: 'failed', error: errorText(error) });
    }
  }, [port]);

  const seen = useRef<boolean | undefined>(undefined);
  const mount = useMounted<ViewInstance>(() => {
    const first = seen.current === undefined;
    const dropped = seen.current === true && !listed;
    seen.current = listed;
    if (first || (dropped && !own.current)) void load();
  }, [load, listed]);

  if (phase.kind !== 'ready')
    return (
      <View ref={mount} style={{ flex: 1 }}>
        {phase.kind === 'loading' ? (
          <Loading />
        ) : (
          <LoadFailed error={phase.error} onRetry={() => void load()} />
        )}
      </View>
    );

  const { request } = phase;
  const pending = request.status === 'pending';
  const answer = buildAnswer(request.questions, drafts);
  const update = (question: QuestionItem, next: QuestionDraft) =>
    setDrafts((current) => ({ ...current, [question.id]: next }));

  const submit = async () => {
    if (answer === undefined) return;
    haptic('submit');
    own.current = true;
    setPhase({ kind: 'ready', request, busy: true });
    try {
      const result = await port.answer(answer);
      setPhase({
        kind: 'ready',
        request: { ...request, status: result === 'expired' ? 'expired' : 'decided' },
        notice:
          result === 'accepted' ? { tone: 'success', text: t.answered } : settledNotice(result)!,
      });
    } catch (error) {
      own.current = false;
      setPhase({
        kind: 'ready',
        request,
        notice: { tone: 'danger', text: `${t.decideFailed} ${errorText(error)}` },
      });
    }
  };

  return (
    <View ref={mount} style={{ flex: 1 }}>
      <KeyboardFormScroll
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ padding: 16, gap: 20 }}
        style={{ backgroundColor: theme.background }}
      >
        <Text style={{ color: theme.inkSoft, fontSize: 15 }}>{t.asks(botName)}</Text>
        {request.questions.map((question) => {
          const draft = drafts[question.id] ?? emptyDraft();
          return (
            <View key={question.id} style={{ gap: 10 }}>
              {question.header === undefined ? null : (
                <Text style={{ color: theme.inkSoft, fontSize: 13, fontWeight: '600' }}>
                  {question.header}
                </Text>
              )}
              <Text style={{ color: theme.ink, fontSize: 18, fontWeight: '600' }}>
                {question.question}
              </Text>
              {question.detail === undefined ? null : (
                <Text selectable style={{ color: theme.inkSoft, fontSize: 15 }}>
                  {question.detail}
                </Text>
              )}
              {question.multiSelect === true ? (
                <Text style={{ color: theme.inkSoft, fontSize: 13 }}>{t.multiSelectHint}</Text>
              ) : null}
              {(question.options ?? []).map((option) => {
                const chosen = draft.selected.includes(option.label);
                return (
                  <Pressable
                    key={option.label}
                    accessibilityRole={question.multiSelect === true ? 'checkbox' : 'radio'}
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked: chosen, disabled: !pending }}
                    disabled={!pending || phase.busy === true}
                    onPress={() => update(question, toggleOption(question, draft, option.label))}
                    style={{
                      borderRadius: 12,
                      borderWidth: chosen ? 2 : 1,
                      borderColor: chosen ? theme.accent : theme.border,
                      backgroundColor: theme.surface,
                      padding: 12,
                      gap: 2,
                    }}
                  >
                    <Text style={{ color: theme.ink, fontSize: 16 }}>{option.label}</Text>
                    {option.description === undefined ? null : (
                      <Text style={{ color: theme.inkSoft, fontSize: 14 }}>
                        {option.description}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
              <TextField
                accessibilityLabel={`${t.otherAnswer}: ${question.question}`}
                placeholder={t.otherAnswer}
                editable={pending && phase.busy !== true}
                multiline
                value={draft.custom}
                onChangeText={(text) => update(question, typeCustom(question, draft, text))}
              />
            </View>
          );
        })}
        {phase.notice === undefined ? null : (
          <Notice tone={phase.notice.tone}>{phase.notice.text}</Notice>
        )}
        {pending ? (
          <View style={{ flexDirection: 'row' }}>
            <ActionButton
              label={t.submit}
              disabled={answer === undefined}
              busy={phase.busy === true}
              onPress={() => void submit()}
            />
          </View>
        ) : null}
      </KeyboardFormScroll>
    </View>
  );
}
