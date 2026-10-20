import { useCallback, useRef, useState, type ReactNode } from 'react';
import { View, type ViewInstance } from 'react-native';

import type { HumanAssignmentContext, HumanAttentionItem } from '../host/wire';
import { ActionCard, CardButtons, CardLine, CardNote, DetailRow } from './chat/action-card';
import { useDesignTheme } from './design/theme';
import { radius, space } from './design/tokens';
import { haptic } from './haptics';
import { useMounted } from './mounted';
import { Button } from './primitives/button';
import { KeyboardFormScroll } from './primitives/keyboard-form';
import { Text } from './primitives/text';
import { TextField } from './primitives/text-field';
import { errorText } from './request-parts';
import { t } from './strings';

function Page({ children }: { children: ReactNode }) {
  const theme = useDesignTheme();
  return (
    <KeyboardFormScroll
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingVertical: space.x5, gap: space.x5 }}
      style={{ backgroundColor: theme.layer.canvas.fill }}
    >
      {children}
    </KeyboardFormScroll>
  );
}

function Well({ children }: { children: string }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        backgroundColor: theme.layer.well.fill,
        borderRadius: radius.md,
        paddingHorizontal: space.x4,
        paddingVertical: space.x3,
      }}
    >
      <Text selectable variant="meta">
        {children}
      </Text>
    </View>
  );
}

function useAction(after?: () => void) {
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const pending = useRef(false);
  const run = async (key: string, work: () => Promise<string>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(key);
    setError(undefined);
    try {
      setDone(await work());
      after?.();
    } catch (cause) {
      setError(`${t.actionFailed} ${errorText(cause)}`);
    } finally {
      pending.current = false;
      setBusy(undefined);
    }
  };
  return { busy, error, done, run };
}

function Done({ category, text }: { category: string; text: string }) {
  return (
    <Page>
      <CardLine text={t.cardLine(category, text)} tone="success" />
    </Page>
  );
}

export interface AutoRejectionPort {
  allowOnce(): Promise<void>;
}

export function AutoRejectionView({
  item,
  botName,
  port,
  after,
}: {
  item: HumanAttentionItem;
  botName: string;
  port: AutoRejectionPort;
  after?(): void;
}) {
  const { busy, error, done, run } = useAction(after);
  const category = t.kind['auto-rejection']!;
  if (done !== undefined) return <Done category={category} text={done} />;
  const detail = item.autoRejection;
  return (
    <Page>
      <ActionCard
        category={category}
        status={t.needsYou}
        title={t.autoRejectionTitle(botName)}
        wide
        preview={<Well>{detail?.reason ?? item.summary}</Well>}
        {...(detail === undefined
          ? {}
          : {
              details: (
                <>
                  <DetailRow label={t.tool} value={detail.toolName} />
                  <DetailRow label={t.autoRejectionInput} value={detail.input} />
                </>
              ),
            })}
        {...(error === undefined ? {} : { error })}
      >
        <CardNote>{t.autoRejectionHint}</CardNote>
        <CardButtons stack>
          <Button
            label={t.autoRejectionAllow}
            testID="auto-rejection-allow"
            tone="primary"
            busy={busy === 'allow'}
            onPress={() =>
              void run('allow', async () => {
                await port.allowOnce();
                haptic('approve');
                return t.autoRejectionAllowed;
              })
            }
          />
        </CardButtons>
      </ActionCard>
    </Page>
  );
}

export interface JoinRequestPort {
  decide(accept: boolean): Promise<void>;
}

export function JoinRequestView({
  item,
  botName,
  port,
  after,
}: {
  item: HumanAttentionItem;
  botName: string;
  port: JoinRequestPort;
  after?(): void;
}) {
  const { busy, error, done, run } = useAction(after);
  const category = t.kind['group-join-request']!;
  if (done !== undefined) return <Done category={category} text={done} />;
  const decide = (accept: boolean) =>
    void run(accept ? 'accept' : 'decline', async () => {
      await port.decide(accept);
      haptic(accept ? 'approve' : 'deny');
      return accept ? t.joinAccepted : t.joinDeclined;
    });
  return (
    <Page>
      <ActionCard
        category={category}
        status={t.needsYou}
        title={t.joinTitle(botName, item.channelName ?? '')}
        wide
        {...(error === undefined ? {} : { error })}
      >
        <CardButtons stack>
          <Button
            label={t.joinAccept}
            testID="join-accept"
            tone="primary"
            disabled={busy !== undefined}
            busy={busy === 'accept'}
            onPress={() => decide(true)}
          />
          <Button
            label={t.joinDecline}
            testID="join-decline"
            tone="danger"
            disabled={busy !== undefined}
            busy={busy === 'decline'}
            onPress={() => decide(false)}
          />
        </CardButtons>
      </ActionCard>
    </Page>
  );
}

export interface AssignmentPort {
  load(): Promise<HumanAssignmentContext>;
  reply(body: string): Promise<{ id: string; at: string; body: string }>;
}

type AssignmentPhase =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; context: HumanAssignmentContext };

export function AssignmentView({
  item,
  botName,
  port,
  after,
}: {
  item: HumanAttentionItem;
  botName: string;
  port: AssignmentPort;
  after?(): void;
}) {
  const [phase, setPhase] = useState<AssignmentPhase>({ kind: 'loading' });
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<{ body: string }>();
  const { busy, error, run } = useAction(after);

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      setPhase({ kind: 'ready', context: await port.load() });
    } catch {
      setPhase({ kind: 'failed' });
    }
  }, [port]);
  const mount = useMounted<ViewInstance>(() => void load(), [load]);

  const category = t.kind[item.kind] ?? t.otherKind;
  const title =
    item.kind === 'assignment-blocked'
      ? t.assignmentBlocked(botName)
      : t.assignmentWaiting(botName);
  if (phase.kind !== 'ready')
    return (
      <View ref={mount} style={{ flex: 1 }}>
        <Page>
          <ActionCard
            category={category}
            title={title}
            wide
            busy={phase.kind === 'loading'}
            {...(phase.kind === 'failed' ? { error: t.cardLoadFailed } : {})}
          >
            <CardButtons>
              <Button label={t.tryAgain} onPress={() => void load()} />
            </CardButtons>
          </ActionCard>
        </Page>
      </View>
    );

  const { context } = phase;
  const reply = sent ?? context.reply;
  const target = context.reports.find((report) => report.sourceEventId === context.sourceEventId);
  const send = () =>
    void run('send', async () => {
      const value = await port.reply(draft);
      setSent(value);
      setDraft('');
      haptic('approve');
      return t.assignmentSent;
    });
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <Page>
        <ActionCard
          category={category}
          {...(reply === undefined ? { status: t.needsYou } : {})}
          title={title}
          wide
          preview={<Well>{target?.summary ?? item.summary}</Well>}
          details={<DetailRow label={t.assignmentPurpose} value={context.purpose} />}
          {...(error === undefined ? {} : { error })}
        >
          {reply !== undefined ? (
            <>
              <DetailRow label={t.assignmentReply} value={reply.body} />
              <CardNote>{sent === undefined ? t.assignmentForwarding : t.assignmentSent}</CardNote>
            </>
          ) : context.canReply ? (
            <>
              <TextField
                accessibilityLabel={t.assignmentReplyHint}
                testID="assignment-reply-input"
                placeholder={t.assignmentReplyHint}
                editable={busy === undefined}
                multiline
                value={draft}
                onChangeText={setDraft}
              />
              <CardButtons stack>
                <Button
                  label={t.assignmentSend}
                  testID="assignment-reply-send"
                  tone="primary"
                  disabled={draft.trim() === ''}
                  busy={busy === 'send'}
                  onPress={send}
                />
              </CardButtons>
            </>
          ) : (
            <CardNote>{t.assignmentStale}</CardNote>
          )}
        </ActionCard>
      </Page>
    </View>
  );
}
