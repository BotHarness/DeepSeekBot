import { useCallback, useRef, useState } from 'react';
import { View, type ViewInstance } from 'react-native';

import type { CardResolution } from '../../host/conversation';
import {
  previewInput,
  readableInput,
  type ApprovalChoice,
  type ApprovalRequest,
  type DecisionResult,
} from '../../host/requests';
import type { ToolApprovalOutcome } from '../../host/wire';
import {
  approvalFileChange,
  approvalShellCommand,
} from '../../../../../packages/client/src/client/approval-diff';
import { alwaysNote, executionNote, expiryLabel, highRisk, riskNote } from '../approval-note';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { errorText } from '../request-parts';
import { haptic } from '../haptics';
import { t } from '../strings';
import {
  ActionCard,
  CardButtons,
  CardLine,
  CardNote,
  DetailRow,
  type CardLineTone,
} from './action-card';
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
      status: 'decided' | 'expired';
      outcome?: ToolApprovalOutcome;
      mine: boolean;
    };

type Line = { text: string; tone: CardLineTone };

function outcomeTone(outcome: ToolApprovalOutcome | undefined): CardLineTone {
  if (outcome === undefined) return 'subtle';
  return outcome === 'rejected' ? 'danger' : 'success';
}

function settledLine(
  subject: string,
  phase: Phase,
  resolution: Extract<CardResolution, { kind: 'tool-approval' }> | undefined,
): Line | undefined {
  const state = (outcome: ToolApprovalOutcome | undefined, elsewhere: boolean): Line => {
    const label = outcome === undefined ? t.cardDecided : t.cardOutcome[outcome];
    return {
      text: t.cardLine(subject, elsewhere ? t.elsewhere(label) : label),
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
  return state(phase.outcome, true);
}

export function ApprovalCard({
  port,
  subject,
  resolution,
  focused = false,
  group,
  wide = false,
  onSettled,
}: {
  port: ApprovalCardPort;
  subject?: string;
  resolution?: Extract<CardResolution, { kind: 'tool-approval' }>;
  focused?: boolean;
  group?: BubbleGroup;
  wide?: boolean;
  onSettled?(result: DecisionResult): void;
}) {
  const theme = useDesignTheme();
  const known = useRef(resolution !== undefined);
  const [phase, setPhase] = useState<Phase>(
    known.current ? { kind: 'known' } : { kind: 'loading' },
  );

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const request = await port.load();
      setPhase(
        request.status === 'pending'
          ? { kind: 'pending', request }
          : {
              kind: 'settled',
              status: request.status,
              mine: false,
              ...(request.outcome === undefined ? {} : { outcome: request.outcome }),
            },
      );
    } catch {
      setPhase({ kind: 'failed' });
    }
  }, [port]);

  const mount = useMounted<ViewInstance>(() => {
    if (!known.current) void load();
  }, [load]);

  const tool = phase.kind === 'pending' ? phase.request.toolName : (subject ?? '');
  const line = settledLine(tool, phase, resolution);
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

  const category = t.toolCategory(tool);
  const title = t.runTool(tool);
  if (phase.kind !== 'pending')
    return (
      <View ref={mount}>
        <ActionCard
          category={category}
          title={title}
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
  const decide = async (outcome: ApprovalChoice) => {
    haptic(outcome === 'rejected' ? 'deny' : 'approve');
    setPhase({ kind: 'pending', request, busy: outcome });
    try {
      const result = await port.decide(outcome);
      if (result === 'accepted') {
        setPhase({ kind: 'settled', status: 'decided', outcome, mine: true });
        onSettled?.(result);
        return;
      }
      const now = await port.load().catch(() => undefined);
      setPhase({
        kind: 'settled',
        status: result,
        mine: false,
        ...(now?.outcome === undefined ? {} : { outcome: now.outcome }),
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
  const rows = readableInput(request.input);
  const change = approvalFileChange(request.toolName, request.input);
  const shell =
    change === undefined ? approvalShellCommand(request.toolName, request.input) : undefined;
  const first =
    change !== undefined
      ? { label: '', value: `${change.path}  +${change.added} −${change.removed}` }
      : shell !== undefined
        ? { label: '', value: shell.command }
        : previewInput(request.input);
  const running = executionNote(request);
  return (
    <View ref={mount}>
      <ActionCard
        category={category}
        status={expiryLabel(request.expiresAt, Date.now()) ?? t.needsYou}
        title={title}
        focused={focused}
        wide={wide}
        {...(phase.error === undefined ? {} : { error: phase.error })}
        {...(first === undefined || first.value === ''
          ? {}
          : {
              preview: (
                <View
                  style={{
                    backgroundColor: theme.layer.well.fill,
                    borderRadius: radius.md,
                    paddingHorizontal: space.x4,
                    paddingVertical: space.x3,
                  }}
                >
                  <Text
                    selectable
                    variant="meta"
                    numberOfLines={2}
                    style={{ fontFamily: theme.mono }}
                  >
                    {first.value}
                  </Text>
                </View>
              ),
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
        <CardButtons stack>
          <Button
            label={t.allowOnce}
            testID="approval-allow-once"
            tone="primary"
            disabled={phase.busy !== undefined}
            busy={phase.busy === 'allowed-once'}
            onPress={() => void decide('allowed-once')}
          />
          <Button
            label={t.alwaysAllow}
            testID="approval-always-allow"
            disabled={phase.busy !== undefined || !request.allowAlways}
            busy={phase.busy === 'allowed-always-tool'}
            onPress={() => void decide('allowed-always-tool')}
          />
          <Button
            label={t.reject}
            testID="approval-deny"
            tone="danger"
            disabled={phase.busy !== undefined}
            busy={phase.busy === 'rejected'}
            onPress={() => void decide('rejected')}
          />
        </CardButtons>
      </ActionCard>
    </View>
  );
}
