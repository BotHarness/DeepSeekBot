import { toolEffectLabels } from '../../../../../packages/core/src/workspaces/tool-effect-labels';
import { useCallback, useRef, useState } from 'react';
import { View, type ViewInstance } from 'react-native';

import type { CardResolution } from '@botharness/host-client/conversation';
import {
  approvalCommand,
  previewInput,
  readableInput,
  type ApprovalChoice,
  type ApprovalContent,
  type ApprovalRequest,
  type DecisionResult,
} from '@botharness/host-client/requests';
import type { ShellPrefixApproval, ToolApprovalOutcome } from '@botharness/host-protocol/wire';
import { approvalFileChange } from '@botharness/host-client/shared/approval-diff';
import {
  connectorRequestView,
  type ConnectorRequestChoice,
} from '@botharness/host-client/shared/connector-request';
import { alwaysNote, executionNote, expiryLabel, highRisk, riskNote } from '../approval-note';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { errorText } from '../request-parts';
import { haptic } from '../haptics';
import { useStrings, t, locale } from '../strings';
import {
  ActionCard,
  CardButtons,
  CardEmbed,
  CardNote,
  CardPreview,
  DetailRow,
} from './action-card';
import type { CardLineTone } from './card-line';
import { FileDiff } from './approval-diff';
import type { BubbleGroup } from './bubble-shape';
import type { ApprovalPresetPort } from './approval-preset';
import { ApprovalPresetRow } from './approval-preset-row';
import { ContextMenuArea, nativeContextMenu } from '../primitives/context-menu';
import { showActionMenu } from '../primitives/app-dialog';
import {
  shellScopeActions,
  shellScopeErrorText,
  type CustomShellScope,
} from './shell-scope-actions';
import { ShellScopeSheet } from './shell-scope-sheet';

export interface ApprovalCardPort {
  load(): Promise<ApprovalRequest>;
  decide(outcome: ApprovalChoice, rule?: ShellPrefixApproval): Promise<DecisionResult>;
  decideConnector?(choice: ConnectorRequestChoice): Promise<DecisionResult>;
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
  alwaysAllow?: boolean;
  preset?: ApprovalPresetPort;
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
  alwaysAllow = true,
  preset,
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
  const [customScope, setCustomScope] = useState<CustomShellScope>();
  const [connectorChoice, setConnectorChoice] = useState<ConnectorRequestChoice>();
  const [pendingChoice, setPendingChoice] = useState<ConnectorRequestChoice>();

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
  const viewOnly = phase.kind === 'pending' && phase.request.canDecide === false;
  const actionable = phase.kind === 'pending' && resolution === undefined && !viewOnly;
  const busy = phase.kind === 'pending' ? phase.busy : undefined;
  const outcome =
    phase.kind === 'settled' && phase.mine
      ? phase.outcome
      : (resolution?.outcome ?? (phase.kind === 'settled' ? phase.outcome : undefined));
  const selected =
    outcome === 'allowed-always-exact' ||
    outcome === 'allowed-always-prefix' ||
    outcome === 'allowed-always-all'
      ? 'allowed-always-tool'
      : outcome;
  const decide = async (
    outcome: ApprovalChoice,
    rule?: ShellPrefixApproval,
    rethrow = false,
    choice?: ConnectorRequestChoice,
  ): Promise<boolean> => {
    if (
      phase.kind !== 'pending' ||
      submission.pending ||
      !submission.active ||
      current.current !== submission ||
      resolution !== undefined
    )
      return false;
    submission.pending = true;
    setPhase({ kind: 'pending', request: phase.request, busy: outcome });
    try {
      const result = await (choice !== undefined && port.decideConnector !== undefined
        ? port.decideConnector(choice)
        : rule === undefined
          ? port.decide(outcome)
          : port.decide(outcome, rule));
      if (!submission.active || current.current !== submission) return true;
      if (result === 'accepted') {
        if (choice !== undefined) setConnectorChoice(choice);
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
        return true;
      }
      const now = await port.load().catch(() => undefined);
      if (!submission.active || current.current !== submission) return true;
      setPhase({
        kind: 'settled',
        request: now ?? phase.request,
        status: now?.status === 'stopped' ? 'stopped' : result,
        mine: false,
        label: requestLabel(request),
        ...(now?.outcome === undefined ? {} : { outcome: now.outcome }),
      });
      onSettled?.(result);
      return true;
    } catch (error) {
      if (!submission.active || current.current !== submission) return false;
      submission.pending = false;
      if (rethrow) {
        setPhase({ kind: 'pending', request: phase.request });
        throw error;
      }
      setPhase({
        kind: 'pending',
        request: phase.request,
        error: shellScopeErrorText(error) ?? `${t.decideFailed} ${errorText(error)}`,
      });
      return false;
    }
  };
  const scopeActions =
    actionable && alwaysAllow && busy === undefined && request.allowAlways
      ? shellScopeActions(live?.shellSuggestions, request.toolName, {
          decide: (decision) =>
            void decide(
              decision.outcome,
              decision.outcome === 'allowed-always-prefix' ? decision.rule : undefined,
            ),
          custom: setCustomScope,
        })
      : [];
  const alwaysAllowButton = (
    <Button
      label={t.alwaysAllow}
      testID="approval-always-allow"
      variant="card-solid"
      disabled={!actionable || busy !== undefined || !request.allowAlways}
      selected={selected === 'allowed-always-tool'}
      busy={busy !== undefined && busy.startsWith('allowed-always')}
      onPress={() => void decide('allowed-always-tool')}
      {...(scopeActions.length === 0 || nativeContextMenu
        ? {}
        : {
            onLongPress: () => {
              haptic('menu');
              showActionMenu(
                t.shellScope.title,
                scopeActions.map((action) => ({
                  text: action.label,
                  icon: action.key === 'custom' ? ('edit' as const) : ('check' as const),
                  onPress: action.run,
                })),
              );
            },
          })}
    />
  );
  const connector = connectorRequestView(request);
  if (connector !== undefined) {
    const name = connector.name === '' ? t.connector.category : connector.name;
    const account = connector.account;
    const decideConnector = (choice: ConnectorRequestChoice) => {
      setPendingChoice(choice);
      void decide(choice === 'deny' ? 'rejected' : 'allowed-once', undefined, false, choice);
    };
    const connectorLine =
      connectorChoice !== undefined && phase.kind === 'settled' && phase.mine
        ? { text: t.connector.outcome[connectorChoice], tone: outcomeTone(phase.outcome) }
        : line;
    const canDecideHere = port.decideConnector !== undefined;
    return (
      <View ref={mount}>
        <ActionCard
          category={t.connector.category}
          {...(actionable
            ? { status: expiryLabel(live?.expiresAt, Date.now()) ?? t.needsYou }
            : {})}
          title={account === undefined ? t.connector.connect(name) : t.connector.use(name)}
          focused={focused}
          wide={wide}
          {...(phase.kind === 'failed'
            ? { error: t.cardLoadFailed }
            : phase.kind === 'pending' && phase.error !== undefined
              ? { error: phase.error }
              : {})}
          busy={phase.kind === 'loading' && resolution === undefined}
          {...(account === undefined || account.label === ''
            ? {}
            : {
                preview: (
                  <CardPreview
                    text={[
                      account.label,
                      account.identity,
                      connector.access === 'write' ? t.connector.write : t.connector.read,
                      account.holder === 'bot' ? t.connector.botOwn : t.connector.shared,
                    ]
                      .filter((part) => part !== undefined && part !== '')
                      .join(' · ')}
                  />
                ),
              })}
        >
          {connector.reason === '' ? null : (
            <CardNote testID="connector-request-reason">{connector.reason}</CardNote>
          )}
          {account === undefined && actionable ? (
            <CardNote>{t.connector.connectOnComputer}</CardNote>
          ) : null}
          {connectorLine === undefined ? null : (
            <CardNote testID="approval-result" live>
              {connectorLine.text}
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
          {viewOnly ? (
            <CardNote testID="approval-view-only" live>
              {t.viewOnly}
            </CardNote>
          ) : null}
          {viewOnly || !canDecideHere || !actionable ? null : (
            <CardButtons stack>
              {account === undefined ? null : (
                <>
                  <Button
                    label={t.connector.turnOn}
                    testID="connector-turn-on"
                    variant="card-solid"
                    tone="primary"
                    disabled={busy !== undefined}
                    busy={busy !== undefined && pendingChoice === 'persistent'}
                    onPress={() => decideConnector('persistent')}
                  />
                  <Button
                    label={t.connector.once}
                    testID="connector-once"
                    variant="card-solid"
                    disabled={busy !== undefined}
                    busy={busy !== undefined && pendingChoice === 'once'}
                    onPress={() => decideConnector('once')}
                  />
                </>
              )}
              <Button
                label={t.connector.no}
                testID="approval-deny"
                variant="card-solid"
                tone="danger"
                disabled={busy !== undefined}
                busy={busy !== undefined && pendingChoice === 'deny'}
                onPress={() => decideConnector('deny')}
              />
            </CardButtons>
          )}
        </ActionCard>
      </View>
    );
  }
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
  const effects =
    request.effects === undefined
      ? undefined
      : toolEffectLabels(request.effects, locale).join(' · ');
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
            {request.cwd === '' ? null : <DetailRow label={t.workingFolder} value={request.cwd} />}
            {change !== undefined ? (
              <FileDiff change={change} />
            ) : (
              rows.map((row, index) => (
                <DetailRow
                  key={`${row.label}-${index}`}
                  label={
                    Object.hasOwn(t.inputLabels, row.label) ? t.inputLabels[row.label]! : row.label
                  }
                  value={row.value}
                />
              ))
            )}
            {effects === undefined ? null : <CardNote>{effects}</CardNote>}
            {highRisk(request.toolName) ? null : <CardNote>{riskNote(request.toolName)}</CardNote>}
            {alwaysAllow ? <CardNote>{alwaysNote(request)}</CardNote> : null}
          </>
        }
      >
        {request.effects?.changes !== 'irreversible' || effects === undefined ? null : (
          <CardNote testID="approval-effects">{effects}</CardNote>
        )}
        {running === undefined ? null : <CardNote>{running}</CardNote>}
        {highRisk(request.toolName) ? <CardNote>{riskNote(request.toolName)}</CardNote> : null}
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
        {viewOnly ? (
          <CardNote testID="approval-view-only" live>
            {t.viewOnly}
          </CardNote>
        ) : null}
        {viewOnly ? null : (
          <CardButtons stack>
            <Button
              label={t.allowOnce}
              testID="approval-allow-once"
              variant="card-solid"
              tone="primary"
              disabled={!actionable || busy !== undefined}
              selected={selected === 'allowed-once'}
              busy={busy === 'allowed-once'}
              onPress={() => void decide('allowed-once')}
            />
            {!alwaysAllow ? null : nativeContextMenu && scopeActions.length > 0 ? (
              <ContextMenuArea actions={scopeActions}>{alwaysAllowButton}</ContextMenuArea>
            ) : (
              alwaysAllowButton
            )}
            <Button
              label={t.reject}
              testID="approval-deny"
              variant="card-solid"
              tone="danger"
              disabled={!actionable || busy !== undefined}
              selected={selected === 'rejected'}
              busy={busy === 'rejected'}
              onPress={() => void decide('rejected')}
            />
          </CardButtons>
        )}
        {actionable && preset !== undefined ? (
          <CardEmbed>
            <ApprovalPresetRow port={preset} />
          </CardEmbed>
        ) : null}
      </ActionCard>
      {customScope === undefined || !actionable ? null : (
        <ShellScopeSheet
          choice={customScope}
          onSave={(rule) => decide('allowed-always-prefix', rule, true)}
          onClose={() => setCustomScope(undefined)}
        />
      )}
    </View>
  );
}
