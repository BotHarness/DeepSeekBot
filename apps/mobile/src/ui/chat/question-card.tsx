import { useCallback, useRef, useState } from 'react';
import { View, type ViewInstance } from 'react-native';

import type { CardResolution } from '../../host/conversation';
import {
  buildAnswer,
  emptyDraft,
  typeCustom,
  type DecisionResult,
  type QuestionDraft,
  type QuestionRequest,
} from '../../host/requests';
import type { QuestionAnswer } from '../../host/wire';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { errorText } from '../request-parts';
import { haptic } from '../haptics';
import { useStrings, t } from '../strings';
import { ActionCard, CardButtons, CardGroup, CardPreview } from './action-card';
import { CardLine, type CardLineTone } from './card-line';
import type { BubbleGroup } from './bubble-shape';
import { DraftEditor } from './draft-editor';
import { QuestionFields } from './question-fields';

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
  const t = useStrings();
  const known = useRef(resolution !== undefined);
  const current = useRef({ port, pending: false, active: false });
  if (current.current.port !== port) {
    current.current = { port, pending: false, active: false };
    known.current = resolution !== undefined;
  }
  const submission = current.current;
  const [phase, setPhase] = useState<Phase>(
    known.current ? { kind: 'known' } : { kind: 'loading' },
  );
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({});
  const [editing, setEditing] = useState<string>();

  const load = useCallback(async () => {
    setDrafts({});
    setPhase({ kind: 'loading' });
    try {
      const request = await port.load();
      if (!submission.active || current.current !== submission) return;
      setPhase(
        request.status === 'pending'
          ? { kind: 'pending', request }
          : { kind: 'settled', status: request.status, mine: false },
      );
    } catch {
      if (!submission.active || current.current !== submission) return;
      setPhase({ kind: 'failed' });
    }
  }, [port, submission]);

  const mount = useMounted<ViewInstance>(() => {
    submission.active = true;
    if (!known.current) void load();
    return () => {
      submission.active = false;
    };
  }, [load, submission]);

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
            <Button symbol="refresh" label={t.tryAgain} onPress={() => void load()} />
          </CardButtons>
        </ActionCard>
      </View>
    );

  const { request } = phase;
  const single = request.questions.length === 1 ? request.questions[0] : undefined;
  const answer = buildAnswer(request.questions, drafts);
  const instant = single !== undefined && single.multiSelect !== true;
  const typed = Object.values(drafts).some((draft) => draft.custom.trim() !== '');
  const editingQuestion = request.questions.find((question) => question.id === editing);
  const submit = async (answer: QuestionAnswer | undefined) => {
    if (
      answer === undefined ||
      submission.pending ||
      !submission.active ||
      current.current !== submission ||
      resolution !== undefined
    )
      return;
    submission.pending = true;
    setPhase({ kind: 'pending', request, busy: true });
    try {
      const result = await port.answer(answer);
      if (!submission.active || current.current !== submission) return;
      if (result === 'accepted') haptic('submit');
      setPhase({
        kind: 'settled',
        status: result === 'expired' ? 'expired' : 'decided',
        mine: result === 'accepted',
      });
      onSettled?.(result);
    } catch (error) {
      if (!submission.active || current.current !== submission) return;
      submission.pending = false;
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
        busy={instant && phase.busy === true}
        focused={focused}
        wide={wide}
        {...(phase.error === undefined ? {} : { error: phase.error })}
        preview={
          <CardGroup>
            {single?.detail === undefined ? null : (
              <CardPreview text={single.detail} well={false} tone="muted" />
            )}
            {request.questions.map((question) => (
              <QuestionFields
                key={question.id}
                question={question}
                draft={drafts[question.id] ?? emptyDraft()}
                heading={single === undefined}
                disabled={phase.busy === true}
                inChat={replyInChat && single !== undefined}
                {...(expandInput ? { onExpand: () => setEditing(question.id) } : {})}
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
          </CardGroup>
        }
      >
        {instant && !typed ? null : (
          <CardButtons>
            <Button
              symbol="check"
              label={t.submitChoice}
              tone="primary"
              disabled={answer === undefined}
              busy={phase.busy === true}
              onPress={() => void submit(answer)}
            />
          </CardButtons>
        )}
      </ActionCard>
      {editingQuestion === undefined ? null : (
        <DraftEditor
          value={drafts[editingQuestion.id]?.custom ?? ''}
          placeholder={editingQuestion.options?.length ? t.otherAnswer : t.typeAnswer}
          canSend={false}
          onChange={(text) =>
            setDrafts((current) => ({
              ...current,
              [editingQuestion.id]: typeCustom(
                editingQuestion,
                current[editingQuestion.id] ?? emptyDraft(),
                text,
              ),
            }))
          }
          onSend={() => setEditing(undefined)}
          onClose={() => setEditing(undefined)}
        />
      )}
    </View>
  );
}
