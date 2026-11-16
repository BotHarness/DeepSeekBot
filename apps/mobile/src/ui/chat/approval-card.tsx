import { useCallback, useRef, useState } from 'react';
import { View, type ViewInstance } from 'react-native';

import type { CardResolution } from '../../host/conversation';
import {
  approvalCommand,
  previewInput,
  readableInput,
  type ApprovalChoice,
  type ApprovalContent,
  type ApprovalRequest,
  type DecisionResult,
} from '../../host/requests';
import type { ToolApprovalOutcome } from '../../host/wire';
import { approvalFileChange } from '../../../../../packages/client/src/client/approval-diff';
import { alwaysNote, executionNote, expiryLabel, highRisk, riskNote } from '../approval-note';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { errorText } from '../request-parts';
import { haptic } from '../haptics';
import { useStrings, t } from '../strings';
import { ActionCard, CardButtons, CardNote, CardPreview, DetailRow } from './action-card';
import type { CardLineTone } from './card-line';
import { FileDiff } from './approval-diff';
import type { BubbleGroup } from './bubble-shape';

export interface ApprovalCardPort {
  load(): Promise<ApprovalRequest>;
  decide(outcome: ApprovalChoice): Promise<DecisionResult>;
}

type Phase =
  | { kind: 'known' }
  | { kind: 'loading' }
  | { kind: 'failed' }
  | {
      kind: 'pending';
      request: ApprovalRequest;
      busy?: ApprovalChoice;
      error?: string;
    }
  | {
      kind: 'settled';
      request: ApprovalRequest;
      status: 'decided' | 'expired' | 'stopped';
      outcome?: ToolApprovalOutcome;
      mine: boolean;
      label?: string;
    };

type Line = { text: string; tone: CardLineTone };

const LABEL_LIMIT = 80;

function requestLabel(request: ApprovalContent): string {
  const command = approvalCommand(request.toolName, request.input);
  if (command === undefined) return request.toolName;
  return briefCommand(command);
}

function briefCommand(command: string): string {
  const first = command.split('\n', 1)[0]!.trim();
  return first.length <= LABEL_LIMIT && first.length === command.trim().length
    ? first
    : `${first.slice(0, LABEL_LIMIT).trimEnd()}…`;
}

function outcomeTone(outcome: ToolApprovalOutcome | undefined): CardLineTone {
  if (outcome === undefined) return 'subtle';
  return outcome === 'rejected' ? 'danger' : 'success';
}

function settledLine(
  subject: string,
  phase: Phase,
  resolution: Extract<CardResolution, { kind: 'tool-approval' }> | undefined,
  decidedHere: boolean,
): Line | undefined {
  const state = (outcome: ToolApprovalOutcome | undefined, elsewhere: boolean): Line => {
    const label = outcome === undefined ? t.cardDecided : t.cardOutcome[outcome];
    return {
      text: t.cardLine(subject, elsewhere && !decidedHere ? t.elsewhere(label) : label),
      tone: outcomeTone(outcome),
    };
  };
  if (phase.kind === 'settled' && phase.mine) return state(phase.outcome, false);
  if (resolution !== undefined) {
    if (phase.kind === 'pending' && phase.busy !== undefined)
      return state(resolution.outcome, false);
    return state(resolution.outcome, phase.kind !== 'known');
  }
  if (phase.kind !== 'settled') return undefined;
  if (phase.status === 'expired')
    return { text: t.cardLine(subject, t.cardExpired), tone: 'subtle' };
  if (phase.status === 'stopped')
    return { text: t.cardLine(subject, t.cardStopped), tone: 'subtle' };
  return state(phase.outcome, true);
}

interface ApprovalCardProps {
  port: ApprovalCardPort;
  subject?: string;
  command?: string;
  content?: ApprovalContent;
  contentCleared?: boolean;
  resolution?: Extract<CardResolution, { kind: 'tool-approval' }>;
  decidedHere?: boolean;
  focused?: boolean;
  group?: BubbleGroup;
  wide?: boolean;
  onSettled?(result: DecisionResult): void;
}

export function ApprovalCard(props: ApprovalCardProps) {
  return <ApprovalCardContent key={props.contentCleared ? 'cleared' : 'available'} {...props} />;
}

function ApprovalCardContent({
  port,
  subject,
  command,
  content,
  contentCleared = false,
  resolution,
  decidedHere = false,
  focused = false,
  wide = false,
  onSettled,
}: ApprovalCardProps) {
  const t = useStrings();
  const known = useRef(contentCleared || resolution !== undefined);
  const current = useRef({ port, pending: false, active: false });
  if (current.current.port !== port) {
    current.current = { port, pending: false, active: false };
    known.current = contentCleared || resolution !== undefined;
  }
  const submission = current.current;
  const [phase, setPhase] = useState<Phase>(
    known.current ? { kind: 'known' } : { kind: 'loading' },
  );

  const load = useCallback(async () => {
    if (contentCleared) return;
    setPhase({ kind: 'loading' });
    try {
      const request = await port.load();
      if (!submission.active || current.current !== submission) return;
      setPhase(
        request.status === 'pending'
          ? { kind: 'pending', request }
          : {
              kind: 'settled',
              request,
              status: request.status,
              mine: false,
              label: requestLabel(request),
              ...(request.outcome === undefined ? {} : { outcome: request.outcome }),
            },
      );
    } catch {
      if (!submission.active || current.current !== submission) return;
      setPhase({ kind: 'failed' });
    }
  }, [contentCleared, port, submission]);

  const mount = useMounted<ViewInstance>(() => {
    submission.active = true;
    if (!known.current) void load();
    return () => {
      submission.active = false;
    };
  }, [load, submission]);

  const live = phase.kind === 'pending' || phase.kind === 'settled' ? phase.request : undefined;
  const request = contentCleared ? undefined : (live ?? content);
  const tool = contentCleared ? '' : (request?.toolName ?? subject ?? '');
  const label =
    request === undefined
      ? contentCleared || command === undefined
        ? tool
        : briefCommand(command)
      : requestLabel(request);
  const line = settledLine(label, phase, resolution, decidedHere);
  const category = t.toolCategory(tool);
  const title = t.runTool(tool);
  if (request === undefined)
    return (
      <View ref={mount}>
        <ActionCard
          category={category}
          title={title}
          focused={focused}
          wide={wide}
          busy={phase.kind === 'loading' && resolution === undefined}
          {...(phase.kind === 'known' || resolution !== undefined
            ? { error: t.cardContentUnavailable }
            : phase.kind === 'failed'
              ? { error: t.cardLoadFailed }
              : {})}
        >
          {line === undefined ? null : (
            <CardNote testID="approval-result" live>
              {line.text}
            </CardNote>
          )}
          {contentCleared || resolution !== undefined ? null : (
            <CardButtons>
              <Button
                testID="approval-retry"
                symbol="refresh"
                label={t.tryAgain}
                onPress={() => void load()}
              />
            </CardButtons>
          )}
        </ActionCard>
      </View>
    );
  const actionable = phase.kind === 'pending' && resolution === undefined;
  const busy = phase.kind === 'pending' ? phase.busy : undefined;
  const outcome =
    phase.kind === 'settled' && phase.mine
      ? phase.outcome
      : (resolution?.outcome ?? (phase.kind === 'settled' ? phase.outcome : undefined));
  const selected =
    outcome === 'allowed-always-exact' || outcome === 'allowed-always-all'
      ? 'allowed-always-tool'
      : outcome;
  const decide = async (outcome: ApprovalChoice) => {
    if (
      phase.kind !== 'pending' ||
      submission.pending ||
      !submission.active ||
      current.current !== submission ||
      resolution !== undefined
    )
      return;
    submission.pending = true;
    setPhase({ kind: 'pending', request: phase.request, busy: outcome });
    try {
      const result = await port.decide(outcome);
      if (!submission.active || current.current !== submission) return;
      if (result === 'accepted') {
        haptic(outcome === 'rejected' ? 'deny' : 'approve');
        setPhase({
          kind: 'settled',
          request: phase.request,
          status: 'decided',
          outcome,
          mine: true,
          label: requestLabel(request),
        });
        onSettled?.(result);
        return;
      }
      const now = await port.load().catch(() => undefined);
      if (!submission.active || current.current !== submission) return;
      setPhase({
        kind: 'settled',
        request: now ?? phase.request,
        status: now?.status === 'stopped' ? 'stopped' : result,
        mine: false,
        label: requestLabel(request),
        ...(now?.outcome === undefined ? {} : { outcome: now.outcome }),
      });
      onSettled?.(result);
    } catch (error) {
      if (!submission.active || current.current !== submission) return;
      submission.pending = false;
      setPhase({
        kind: 'pending',
        request: phase.request,
        error: `${t.decideFailed} ${errorText(error)}`,
      });
    }
  };
  const rows = readableInput(request.input);
  const change = approvalFileChange(request.toolName, request.input);
  const shown = change === undefined ? approvalCommand(request.toolName, request.input) : undefined;
  const first =
    change !== undefined
      ? { label: '', value: `${change.path}  +${change.added} −${change.removed}` }
      : shown !== undefined
        ? { label: '', value: shown }
        : previewInput(request.input);
  const running = actionable && live !== undefined ? executionNote(live) : undefined;
  return (
    <View ref={mount}>
      <ActionCard
        category={category}
        {...(actionable ? { status: expiryLabel(live?.expiresAt, Date.now()) ?? t.needsYou } : {})}
        title={title}
        focused={focused}
        wide={wide}
        {...(phase.kind === 'failed'
          ? { error: t.cardLoadFailed }
          : phase.kind === 'pending' && phase.error !== undefined
            ? { error: phase.error }
            : {})}
        busy={phase.kind === 'loading' && resolution === undefined}
        {...(first === undefined || first.value === ''
          ? {}
          : {
              preview: <CardPreview text={first.value} mono maxLines={2} />,
            })}
        details={
          <>
            <DetailRow label={t.tool} value={request.toolName} />
            <DetailRow label={t.workingFolder} value={request.cwd} />
            {change !== undefined ? (
              <FileDiff change={change} />
            ) : (
              rows.map((row, index) => (
                <DetailRow key={`${row.label}-${index}`} label={row.label} value={row.value} />
              ))
            )}
            {highRisk(request.toolName) ? null : <CardNote>{riskNote(request.toolName)}</CardNote>}
          </>
        }
      >
        {running === undefined ? null : <CardNote>{running}</CardNote>}
        {highRisk(request.toolName) ? <CardNote>{riskNote(request.toolName)}</CardNote> : null}
        <CardNote>{alwaysNote(request)}</CardNote>
        {line === undefined ? null : (
          <CardNote testID="approval-result" live>
            {line.text}
          </CardNote>
        )}
        {phase.kind !== 'failed' ? null : (
          <CardButtons>
            <Button
              testID="approval-retry"
              symbol="refresh"
              label={t.tryAgain}
              onPress={() => void load()}
            />
          </CardButtons>
        )}
        <CardButtons stack>
          <Button
            symbol="check"
            label={t.allowOnce}
            testID="approval-allow-once"
            tone="primary"
            disabled={!actionable || busy !== undefined}
            selected={selected === 'allowed-once'}
            busy={busy === 'allowed-once'}
            onPress={() => void decide('allowed-once')}
          />
          <Button
            symbol="shield-check"
            label={t.alwaysAllow}
            testID="approval-always-allow"
            disabled={!actionable || busy !== undefined || !request.allowAlways}
            selected={selected === 'allowed-always-tool'}
            busy={busy === 'allowed-always-tool'}
            onPress={() => void decide('allowed-always-tool')}
          />
          <Button
            symbol="x"
            label={t.reject}
            testID="approval-deny"
            tone="danger"
            disabled={!actionable || busy !== undefined}
            selected={selected === 'rejected'}
            busy={busy === 'rejected'}
            onPress={() => void decide('rejected')}
          />
        </CardButtons>
      </ActionCard>
    </View>
  );
}
