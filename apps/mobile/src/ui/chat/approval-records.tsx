import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ReactElement } from 'react';
import { SectionList } from 'react-native';

import {
  loadApprovalHistory,
  loadApprovalRules,
  revokeApprovalRule,
  type ApprovalHistoryEntry,
  type ApprovalRule,
} from '../../host/approval-records';
import { errorText, type Loadable } from '../../host/bot-settings';
import type { HostClient } from '../../host/client';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { confirmDestructive } from '../primitives/app-dialog';
import { SettingsRow } from '../primitives/settings-row';
import { SheetPage } from '../primitives/sheet-page';
import { Text } from '../primitives/text';
import {
  BrowserIcon,
  ComputerIcon,
  FileIcon,
  LockIcon,
  PersonIcon,
  ShieldCheckIcon,
  TerminalIcon,
} from '../shell/icons';
import { useStrings } from '../strings';
import {
  historyDetail,
  ruleDetail,
  ruleTitle,
  toolGlyph,
  type ToolGlyph,
} from './approval-records-text';
import { SheetFailed, SheetFooter, SheetLoading, SHEET_GROUP } from './sheet';
import { Grouped, RemoveButton } from './workspace-sheet';

type Row<T> =
  | { kind: 'item'; key: string; item: T }
  | { kind: 'loading'; key: string }
  | { kind: 'empty'; key: string; text: string }
  | { kind: 'failed'; key: string; text: string }
  | { kind: 'more'; key: string };

type Section<T> = { key: string; footer?: string; data: Row<T>[] };

const ICONS: Record<ToolGlyph, typeof TerminalIcon> = {
  terminal: TerminalIcon,
  browser: BrowserIcon,
  computer: ComputerIcon,
  file: FileIcon,
  lock: LockIcon,
  person: PersonIcon,
  tool: ShieldCheckIcon,
};

function ToolIcon({ toolName }: { toolName: string }) {
  const theme = useDesignTheme();
  const Icon = ICONS[toolGlyph(toolName)];
  return <Icon color={theme.color.muted} size={theme.type.title.line} />;
}

function rowsOf<T>(
  state: Loadable<T[]>,
  key: (item: T) => string,
  empty: string,
  failed: string,
): Row<T>[] {
  if (state.status === 'loading') return [{ kind: 'loading', key: 'loading' }];
  if (state.status === 'failed')
    return [{ kind: 'failed', key: 'failed', text: `${failed} ${state.error}` }];
  if (state.value.length === 0) return [{ kind: 'empty', key: 'empty', text: empty }];
  return state.value.map((item) => ({ kind: 'item', key: key(item), item }));
}

function GroupedList<T>({
  sections,
  item,
  onRetry,
  onMore,
  moreBusy,
}: {
  sections: Section<T>[];
  item(value: T): ReactElement;
  onRetry(): void;
  onMore?(): void;
  moreBusy?: boolean;
}) {
  const t = useStrings();
  const row = (entry: Row<T>) => {
    switch (entry.kind) {
      case 'loading':
        return <SheetLoading />;
      case 'empty':
        return <SettingsRow title={entry.text} tone="muted" on={SHEET_GROUP} />;
      case 'failed':
        return <SheetFailed message={entry.text} onRetry={onRetry} on={SHEET_GROUP} />;
      case 'more':
        return (
          <SettingsRow
            testID="approval-history-more"
            title={t.approvals.more}
            tone="accent"
            on={SHEET_GROUP}
            control={moreBusy ? { kind: 'busy' } : undefined}
            onPress={moreBusy ? undefined : onMore}
          />
        );
      case 'item':
        return item(entry.item);
    }
  };
  return (
    <SectionList<Row<T>, Section<T>>
      style={{ flex: 1 }}
      sections={sections}
      keyExtractor={(entry) => entry.key}
      stickySectionHeadersEnabled={false}
      renderSectionFooter={({ section }) =>
        section.footer === undefined ? null : <SheetFooter>{section.footer}</SheetFooter>
      }
      renderItem={({ item: entry, index, section }) => (
        <Grouped index={index} count={section.data.length}>
          {row(entry)}
        </Grouped>
      )}
    />
  );
}

export function ApprovalHistoryPage({ client, slug }: { client: HostClient; slug: string }) {
  const t = useStrings();
  const [state, setState] = useState<Loadable<ApprovalHistoryEntry[]>>({ status: 'loading' });
  const [cursor, setCursor] = useState<string>();
  const [more, setMore] = useState<'idle' | 'busy'>('idle');
  const [moreError, setMoreError] = useState<string>();
  const generation = useRef(0);
  const load = useCallback(() => {
    const current = ++generation.current;
    setState({ status: 'loading' });
    setCursor(undefined);
    setMoreError(undefined);
    loadApprovalHistory(client, slug).then(
      (page) => {
        if (current !== generation.current) return;
        setState({ status: 'ready', value: page.entries });
        setCursor(page.nextCursor);
      },
      (failure: unknown) => {
        if (current === generation.current)
          setState({ status: 'failed', error: errorText(failure) });
      },
    );
  }, [client, slug]);
  useFocusEffect(load);
  const loadMore = () => {
    if (cursor === undefined || more === 'busy' || state.status !== 'ready') return;
    const current = generation.current;
    setMore('busy');
    setMoreError(undefined);
    loadApprovalHistory(client, slug, cursor)
      .then(
        (page) => {
          if (current !== generation.current) return;
          setState((previous) =>
            previous.status === 'ready'
              ? { status: 'ready', value: [...previous.value, ...page.entries] }
              : previous,
          );
          setCursor(page.nextCursor);
        },
        (failure: unknown) => {
          if (current === generation.current)
            setMoreError(`${t.approvals.historyFailed} ${errorText(failure)}`);
        },
      )
      .finally(() => setMore('idle'));
  };
  const now = Date.now();
  const rows = rowsOf(
    state,
    (entry) => entry.decisionMessageId,
    t.approvals.historyEmpty,
    t.approvals.historyFailed,
  );
  const sections: Section<ApprovalHistoryEntry>[] = [
    {
      key: 'history',
      ...(state.status === 'ready' ? { footer: moreError ?? t.approvals.historyFooter } : {}),
      data: cursor === undefined ? rows : [...rows, { kind: 'more', key: 'more' }],
    },
  ];
  return (
    <SheetPage title={t.approvals.history}>
      <GroupedList
        sections={sections}
        onRetry={load}
        onMore={loadMore}
        moreBusy={more === 'busy'}
        item={(entry) => (
          <SettingsRow
            title={entry.toolName}
            detail={historyDetail(entry, now)}
            leading={<ToolIcon toolName={entry.toolName} />}
            on={SHEET_GROUP}
          />
        )}
      />
    </SheetPage>
  );
}

export function ApprovalRulesPage({ client, slug }: { client: HostClient; slug: string }) {
  const t = useStrings();
  const [state, setState] = useState<Loadable<ApprovalRule[]>>({ status: 'loading' });
  const [busy, setBusy] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const generation = useRef(0);
  const load = useCallback(() => {
    const current = ++generation.current;
    setState({ status: 'loading' });
    loadApprovalRules(client, slug).then(
      (rules) => {
        if (current === generation.current) setState({ status: 'ready', value: rules });
      },
      (error: unknown) => {
        if (current === generation.current) setState({ status: 'failed', error: errorText(error) });
      },
    );
  }, [client, slug]);
  useFocusEffect(load);
  const revoke = async (rule: ApprovalRule) => {
    setBusy(rule.id);
    setFailure(undefined);
    try {
      await revokeApprovalRule(client, slug, rule.id);
      setState((previous) =>
        previous.status === 'ready'
          ? { status: 'ready', value: previous.value.filter((entry) => entry.id !== rule.id) }
          : previous,
      );
    } catch (error) {
      setFailure(`${t.approvals.revokeFailed} ${errorText(error)}`);
    } finally {
      setBusy(undefined);
    }
  };
  const sections: Section<ApprovalRule>[] = [
    {
      key: 'rules',
      ...(state.status === 'ready' ? { footer: t.approvals.rulesFooter } : {}),
      data: rowsOf(state, (rule) => rule.id, t.approvals.rulesEmpty, t.approvals.rulesFailed),
    },
  ];
  return (
    <SheetPage title={t.approvals.rules}>
      {failure === undefined ? null : (
        <Text
          accessibilityRole="alert"
          tone="danger"
          style={{ paddingHorizontal: space.x5, paddingVertical: space.x3 }}
        >
          {failure}
        </Text>
      )}
      <GroupedList
        sections={sections}
        onRetry={load}
        item={(rule) => {
          const title = ruleTitle(rule);
          return (
            <SettingsRow
              testID={`approval-rule-${rule.id}`}
              title={title}
              detail={ruleDetail(rule)}
              leading={<ToolIcon toolName={rule.kind === 'all-opaque' ? '' : rule.toolName} />}
              on={SHEET_GROUP}
              {...(busy === rule.id ? { control: { kind: 'busy' } as const } : {})}
              trailing={
                busy === rule.id ? undefined : (
                  <RemoveButton
                    label={t.approvals.revokeRule(title)}
                    disabled={busy !== undefined}
                    onPress={() =>
                      confirmDestructive(
                        t.confirmAction(t.approvals.revokeRule(title)),
                        t.approvals.revokeDetail,
                        t.approvals.revoke,
                        () => revoke(rule),
                      )
                    }
                  />
                )
              }
            />
          );
        }}
      />
    </SheetPage>
  );
}
