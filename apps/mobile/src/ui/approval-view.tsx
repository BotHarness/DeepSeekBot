import { Text } from './primitives/system-text';
import { useCallback, useRef, useState } from 'react';
import { Platform, ScrollView, View, type ViewInstance } from 'react-native';

import { readableInput, type ApprovalRequest, type DecisionResult } from '../host/requests';
import {
  ActionButton,
  errorText,
  LoadFailed,
  Loading,
  Notice,
  type NoticeTone,
} from './request-parts';
import { useMounted } from './mounted';
import { haptic } from './haptics';
import { t } from './strings';
import { useTheme } from './theme';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export interface ApprovalPort {
  load(): Promise<ApprovalRequest>;
  decide(outcome: 'allowed-once' | 'rejected'): Promise<DecisionResult>;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'failed'; error: string }
  | {
      kind: 'ready';
      request: ApprovalRequest;
      busy?: 'allowed-once' | 'rejected';
      notice?: { tone: NoticeTone; text: string };
    };

function settledNotice(request: ApprovalRequest): { tone: NoticeTone; text: string } | undefined {
  if (request.status === 'expired') return { tone: 'warning', text: t.expired };
  if (request.status === 'decided')
    return {
      tone: 'warning',
      text:
        request.outcome === undefined
          ? t.alreadyDecided
          : t.alreadyDecidedAs(t.outcome[request.outcome]),
    };
  return undefined;
}

export function ApprovalView({
  port,
  botName,
  listed = true,
}: {
  port: ApprovalPort;
  botName: string;
  listed?: boolean;
}) {
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const own = useRef(false);

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const request = await port.load();
      const notice = settledNotice(request);
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
  const decide = async (outcome: 'allowed-once' | 'rejected') => {
    own.current = true;
    haptic(outcome === 'rejected' ? 'deny' : 'approve');
    setPhase({ kind: 'ready', request, busy: outcome });
    try {
      const result = await port.decide(outcome);
      if (result === 'accepted') {
        setPhase({
          kind: 'ready',
          request: { ...request, status: 'decided', outcome },
          notice: { tone: 'success', text: outcome === 'rejected' ? t.rejected : t.approved },
        });
        return;
      }
      const now = await port
        .load()
        .catch(() => ({ ...request, status: result }) as ApprovalRequest);
      setPhase({ kind: 'ready', request: now, notice: settledNotice({ ...now, status: result })! });
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
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, gap: 16 }}
        style={{ backgroundColor: theme.background }}
      >
        <Text style={{ color: theme.ink, fontSize: 22, fontWeight: '700' }}>
          {t.wantsToRun(botName, request.toolName)}
        </Text>
        <View style={{ gap: 4 }}>
          <Text style={{ color: theme.inkSoft, fontSize: 13, fontWeight: '600' }}>
            {t.workingFolder}
          </Text>
          <Text selectable style={{ color: theme.ink, fontFamily: MONO, fontSize: 13 }}>
            {request.cwd}
          </Text>
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.inkSoft, fontSize: 13, fontWeight: '600' }}>
            {t.arguments}
          </Text>
          {readableInput(request.input).map((row, index) => (
            <View
              key={`${row.label}-${index}`}
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderWidth: 1,
                borderRadius: 10,
                padding: 12,
                gap: 4,
              }}
            >
              {row.label === '' ? null : (
                <Text style={{ color: theme.inkSoft, fontSize: 13 }}>{row.label}</Text>
              )}
              <Text selectable style={{ color: theme.ink, fontFamily: MONO, fontSize: 14 }}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
        {phase.notice === undefined ? null : (
          <Notice tone={phase.notice.tone}>{phase.notice.text}</Notice>
        )}
        {request.status === 'pending' ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <ActionButton
              label={t.reject}
              tone="danger"
              disabled={phase.busy !== undefined}
              busy={phase.busy === 'rejected'}
              onPress={() => void decide('rejected')}
            />
            <ActionButton
              label={t.allowOnce}
              disabled={phase.busy !== undefined}
              busy={phase.busy === 'allowed-once'}
              onPress={() => void decide('allowed-once')}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
