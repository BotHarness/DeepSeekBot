import { TextField } from '../primitives/text-field';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View, type ViewInstance } from 'react-native';

import type { CardResolution } from '../../host/conversation';
import {
  buildAnswer,
  emptyDraft,
  toggleOption,
  typeCustom,
  type DecisionResult,
  type QuestionDraft,
  type QuestionRequest,
} from '../../host/requests';
import type { QuestionAnswer, QuestionItem } from '../../host/wire';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { errorText } from '../request-parts';
import { haptic } from '../haptics';
import { t } from '../strings';
import { ActionCard, CardButtons, CardLine, type CardLineTone } from './action-card';
import type { BubbleGroup } from './bubble-shape';
import { DraftEditor } from './draft-editor';

export interface QuestionCardPort {
  load(): Promise<QuestionRequest>;
  answer(answer: QuestionAnswer): Promise<DecisionResult>;
}

type Phase =
  | { kind: 'known' }
  | { kind: 'loading' }
  | { kind: 'failed' }
  | {
      kind: 'pending';
      request: QuestionRequest;
      busy?: boolean;
      error?: string;
    }
  | { kind: 'settled'; status: 'decided' | 'expired'; mine: boolean };

type Line = { text: string; tone: CardLineTone };

export function letter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

function settledLine(
  subject: string,
  phase: Phase,
  resolution: Extract<CardResolution, { kind: 'user-question' }> | undefined,
  answeredHere: boolean,
): Line | undefined {
  const line = (state: string, tone: CardLineTone): Line => ({
    text: subject === '' ? state : t.cardLine(subject, state),
    tone,
  });
  if (phase.kind === 'settled' && phase.mine) return line(t.cardAnswered, 'success');
  if (resolution !== undefined) {
    if (resolution.state === 'cancelled') return line(t.cardCancelled, 'subtle');
    if (answeredHere || (phase.kind === 'pending' && phase.busy === true))
      return line(t.cardAnswered, 'success');
    return line(phase.kind === 'known' ? t.cardAnswered : t.elsewhere(t.cardAnswered), 'success');
  }
  if (phase.kind !== 'settled') return undefined;
  return phase.status === 'expired'
    ? line(t.cardExpired, 'subtle')
    : line(t.elsewhere(t.cardAnswered), 'success');
}

function Option({
  index,
  label,
  description,
  chosen,
  multiple,
  disabled,
  onPress,
}: {
  index: number;
  label: string;
  description?: string;
  chosen: boolean;
  multiple: boolean;
  disabled: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const badge = theme.type.body.line * theme.fontScale + space.x2;
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityLabel={t.option(letter(index), label)}
      accessibilityState={{ checked: chosen, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        paddingHorizontal: space.x4,
        paddingVertical: space.x3,
        borderTopWidth: index === 0 ? 0 : edge.hairline,
        borderTopColor: theme.layer.well.divider,
        backgroundColor: chosen
          ? theme.layer.well.chosen
          : pressed
            ? theme.layer.well.pressed
            : theme.layer.well.fill,
      })}
    >
      <View
        style={{
          width: badge,
          height: badge,
          borderRadius: multiple ? radius.sm : radius.round,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: chosen ? theme.color.accent : theme.layer.well.inset,
        }}
      >
        <Text variant="meta" strong tone={chosen ? 'onAccent' : 'muted'}>
          {letter(index)}
        </Text>
      </View>
      <View style={{ flexShrink: 1, gap: space.x1 }}>
        <Text>{label}</Text>
        {description === undefined ? null : (
          <Text variant="meta" tone="muted">
            {description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function QuestionFields({
  question,
  draft,
  heading,
  disabled,
  inChat,
  expandInput,
  onChange,
  onPick,
}: {
  question: QuestionItem;
  draft: QuestionDraft;
  heading: boolean;
  disabled: boolean;
  inChat: boolean;
  expandInput: boolean;
  onChange(next: QuestionDraft): void;
  onPick?(label: string): void;
}) {
  const theme = useDesignTheme();
  const multiple = question.multiSelect === true;
  const [editing, setEditing] = useState(false);
  const inputLabel = `${t.otherAnswer}: ${question.question}`;
  const placeholder = question.options?.length ? t.otherAnswer : t.typeAnswer;
  return (
    <View style={{ gap: space.x3 }}>
      {heading ? (
        <View style={{ gap: space.x1 }}>
          {question.header === undefined ? null : (
            <Text variant="meta" tone="muted" strong>
              {question.header}
            </Text>
          )}
          <Text strong>{question.question}</Text>
          {question.detail === undefined ? null : (
            <Text selectable variant="meta" tone="muted">
              {question.detail}
            </Text>
          )}
        </View>
      ) : null}
      {multiple ? (
        <Text variant="meta" tone="muted">
          {t.multiSelectHint}
        </Text>
      ) : null}
      {question.options?.length ? (
        <View
          accessibilityLabel={question.question}
          style={{
            overflow: 'hidden',
            borderRadius: radius.md,
            backgroundColor: theme.layer.well.fill,
          }}
        >
          {question.options.map((option, index) => (
            <Option
              key={option.label}
              index={index}
              label={option.label}
              {...(option.description === undefined ? {} : { description: option.description })}
              chosen={draft.selected.includes(option.label)}
              multiple={multiple}
              disabled={disabled}
              onPress={() =>
                onPick === undefined
                  ? onChange(toggleOption(question, draft, option.label))
                  : onPick(option.label)
              }
            />
          ))}
        </View>
      ) : null}
      {inChat ? (
        <Text variant="meta" tone="muted">
          {t.replyInChat}
        </Text>
      ) : expandInput ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={inputLabel}
            disabled={disabled}
            onPress={() => setEditing(true)}
            style={{
              minHeight: theme.touch,
              paddingHorizontal: space.x4,
              paddingVertical: space.x3,
              backgroundColor: theme.layer.field.fill,
              borderColor: theme.layer.field.edge,
              borderWidth: edge.hairline,
              borderRadius: radius.md,
            }}
          >
            <Text tone={draft.custom === '' ? 'muted' : 'fg'}>
              {draft.custom === '' ? placeholder : draft.custom}
            </Text>
          </Pressable>
          {editing ? (
            <DraftEditor
              value={draft.custom}
              placeholder={placeholder}
              canSend={false}
              onChange={(text) => onChange(typeCustom(question, draft, text))}
              onSend={() => setEditing(false)}
              onClose={() => setEditing(false)}
            />
          ) : null}
        </>
      ) : (
        <TextField
          accessibilityLabel={`${t.otherAnswer}: ${question.question}`}
          placeholder={question.options?.length ? t.otherAnswer : t.typeAnswer}
          editable={!disabled}
          multiline
          value={draft.custom}
          onChangeText={(text) => onChange(typeCustom(question, draft, text))}
        />
      )}
    </View>
  );
}

export function QuestionCard({
  port,
  botName,
  subject,
  resolution,
  focused = false,
  group,
  wide = false,
  replyInChat = false,
  expandInput = false,
  answeredHere = false,
  onSettled,
}: {
  port: QuestionCardPort;
  botName: string;
  subject?: string;
  resolution?: Extract<CardResolution, { kind: 'user-question' }>;
  focused?: boolean;
  group?: BubbleGroup;
  wide?: boolean;
  replyInChat?: boolean;
  expandInput?: boolean;
  answeredHere?: boolean;
  onSettled?(result: DecisionResult): void;
}) {
  const known = useRef(resolution !== undefined);
  const [phase, setPhase] = useState<Phase>(
    known.current ? { kind: 'known' } : { kind: 'loading' },
  );
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({});

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const request = await port.load();
      setPhase(
        request.status === 'pending'
          ? { kind: 'pending', request }
          : { kind: 'settled', status: request.status, mine: false },
      );
    } catch {
      setPhase({ kind: 'failed' });
    }
  }, [port]);

  const mount = useMounted<ViewInstance>(() => {
    if (!known.current) void load();
  }, [load]);

  const first =
    phase.kind === 'pending' ? (phase.request.questions[0]?.question ?? '') : (subject ?? '');
  const line = settledLine(first, phase, resolution, answeredHere);
  if (line !== undefined)
    return (
      <View ref={mount}>
        <CardLine
          text={line.text}
          tone={line.tone}
          focused={focused}
          {...(group === undefined ? {} : { group })}
        />
      </View>
    );

  const category = t.kind['user-question']!;
  if (phase.kind !== 'pending')
    return (
      <View ref={mount}>
        <ActionCard
          category={category}
          title={first === '' ? t.asks(botName) : first}
          focused={focused}
          wide={wide}
          busy={phase.kind === 'loading'}
          {...(phase.kind === 'failed' ? { error: t.cardLoadFailed } : {})}
        >
          <CardButtons>
            <Button label={t.tryAgain} onPress={() => void load()} />
          </CardButtons>
        </ActionCard>
      </View>
    );

  const { request } = phase;
  const single = request.questions.length === 1 ? request.questions[0] : undefined;
  const answer = buildAnswer(request.questions, drafts);
  const instant = single !== undefined && single.multiSelect !== true;
  const typed = Object.values(drafts).some((draft) => draft.custom.trim() !== '');
  const submit = async (answer: QuestionAnswer | undefined) => {
    if (answer === undefined) return;
    haptic('submit');
    setPhase({ kind: 'pending', request, busy: true });
    try {
      const result = await port.answer(answer);
      setPhase({
        kind: 'settled',
        status: result === 'expired' ? 'expired' : 'decided',
        mine: result === 'accepted',
      });
      onSettled?.(result);
    } catch (error) {
      setPhase({
        kind: 'pending',
        request,
        error: `${t.decideFailed} ${errorText(error)}`,
      });
    }
  };
  return (
    <View ref={mount}>
      <ActionCard
        category={single?.header ?? category}
        status={t.needsYou}
        title={single?.question ?? t.asks(botName)}
        focused={focused}
        wide={wide}
        {...(phase.error === undefined ? {} : { error: phase.error })}
        preview={
          <View style={{ gap: space.x5 }}>
            {single?.detail === undefined ? null : (
              <Text selectable variant="meta" tone="muted">
                {single.detail}
              </Text>
            )}
            {request.questions.map((question) => (
              <QuestionFields
                key={question.id}
                question={question}
                draft={drafts[question.id] ?? emptyDraft()}
                heading={single === undefined}
                disabled={phase.busy === true}
                inChat={replyInChat && single !== undefined}
                expandInput={expandInput}
                {...(instant
                  ? {
                      onPick: (label: string) =>
                        void submit({
                          answers: [{ id: question.id, selected: [label] }],
                        }),
                    }
                  : {})}
                onChange={(next) => setDrafts((current) => ({ ...current, [question.id]: next }))}
              />
            ))}
          </View>
        }
      >
        {instant && !typed ? null : (
          <CardButtons>
            <Button
              label={t.submitChoice}
              tone="primary"
              disabled={answer === undefined}
              busy={phase.busy === true}
              onPress={() => void submit(answer)}
            />
          </CardButtons>
        )}
      </ActionCard>
    </View>
  );
}
