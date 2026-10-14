import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import type { CardResolution } from '../../host/conversation';
import {
  offersAlwaysAllow,
  readableInput,
  type ApprovalChoice,
  type ApprovalRequest,
  type DecisionResult,
} from '../../host/requests';
import type { ToolApprovalOutcome } from '../../host/wire';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { errorText } from '../request-parts';
import { haptic } from '../haptics';
import { t } from '../strings';
import { ActionCard, CardButtons, CardLine, CardLink, type CardLineTone } from './action-card';

export interface ApprovalCardPort {
  load(): Promise<ApprovalRequest>;
  decide(outcome: ApprovalChoice): Promise<DecisionResult>;
}

type Phase =
  | { kind: 'known' }
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'pending'; request: ApprovalRequest; busy?: ApprovalChoice; error?: string }
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
  botName,
  subject,
  resolution,
  focused = false,
  onDetails,
}: {
  port: ApprovalCardPort;
  botName: string;
  subject?: string;
  resolution?: Extract<CardResolution, { kind: 'tool-approval' }>;
  focused?: boolean;
  onDetails(): void;
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

  const mount = useMounted<View>(() => {
    if (!known.current) void load();
  }, [load]);

  const tool = phase.kind === 'pending' ? phase.request.toolName : (subject ?? '');
  const line = settledLine(tool, phase, resolution);
  if (line !== undefined)
    return (
      <View ref={mount}>
        <CardLine text={line.text} tone={line.tone} focused={focused} />
      </View>
    );

  const eyebrow = t.kind['tool-approval']!;
  const title = t.wantsToRun(botName, tool);
  if (phase.kind !== 'pending')
    return (
      <View ref={mount}>
        <ActionCard
          eyebrow={eyebrow}
          title={title}
          focused={focused}
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
        return;
      }
      const now = await port.load().catch(() => undefined);
      setPhase({
        kind: 'settled',
        status: result,
        mine: false,
        ...(now?.outcome === undefined ? {} : { outcome: now.outcome }),
      });
    } catch (error) {
      setPhase({ kind: 'pending', request, error: `${t.decideFailed} ${errorText(error)}` });
    }
  };
  const first = readableInput(request.input)[0];
  return (
    <View ref={mount}>
      <ActionCard
        eyebrow={eyebrow}
        title={title}
        explanation={t.inFolder(request.cwd)}
        focused={focused}
        {...(phase.error === undefined ? {} : { error: phase.error })}
        preview={
          <View style={{ gap: space.x1 }}>
            {first === undefined || first.value === '' ? null : (
              <View
                style={{
                  backgroundColor: theme.color.base,
                  borderRadius: radius.sm,
                  paddingHorizontal: space.x4,
                  paddingVertical: space.x3,
                }}
              >
                <Text
                  selectable
                  variant="meta"
                  numberOfLines={4}
                  style={{ fontFamily: theme.mono }}
                >
                  {first.value}
                </Text>
              </View>
            )}
            <CardLink label={t.details} onPress={onDetails} />
          </View>
        }
      >
        <CardButtons>
          <Button
            label={t.allowOnce}
            tone="primary"
            disabled={phase.busy !== undefined}
            busy={phase.busy === 'allowed-once'}
            onPress={() => void decide('allowed-once')}
          />
          {offersAlwaysAllow(request.toolName) ? (
            <Button
              label={t.alwaysAllow}
              disabled={phase.busy !== undefined}
              busy={phase.busy === 'allowed-always-exact'}
              onPress={() => void decide('allowed-always-exact')}
            />
          ) : null}
          <Button
            label={t.deny}
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
