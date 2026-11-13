import {
  connectionDiagnostic,
  networkDiagnosticReason,
  type ConnectionDiagnostic,
} from '../host/connection-diagnostic';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { ConnectAccount, ConnectHost, ConnectResult } from '../host/connect-account';
import type { SavedHost } from '../host/hosts';
import { accountHostAdded } from '../host/account-pairing';
import { confirmDestructive } from './primitives/app-dialog';
import { AccountPanel, type AccountPairResult } from './primitives/account-panel';
import { useStrings } from './strings';

export function AccountHosts(props: {
  account: Pick<
    ConnectAccount,
    | 'email'
    | 'signIn'
    | 'hosts'
    | 'revokeHost'
    | 'signOut'
    | 'deleteAccount'
    | 'actionKey'
    | 'pendingDeletion'
    | 'finishLocalCleanup'
  >;
  busy: boolean;
  pairing?: string | undefined;
  saved: readonly SavedHost[];
  results: Readonly<Record<string, AccountPairResult>>;
  failures?: Readonly<Record<string, ConnectionDiagnostic>>;
  onClearFailures?(): void;
  onPair(hosts: ConnectHost[]): Promise<void>;
}) {
  const t = useStrings();
  const { account } = props;
  const [email, setEmail] = useState<string | undefined | null | false>(false);
  const [hosts, setHosts] = useState<ConnectHost[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<ConnectionDiagnostic>();
  const [notice, setNotice] = useState<string>();
  const [managing, setManaging] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const generation = useRef(0);
  const working = useRef(false);
  const actionKey = useRef<string | null>(null);
  const locked = useRef(false);
  locked.current = props.busy || loading;

  const load = async (ticket: number): Promise<ConnectResult<ConnectHost[]> | undefined> => {
    setFresh(false);
    setLoading(true);
    setError(undefined);
    setFailure(undefined);
    const listed = await account.hosts();
    if (ticket !== generation.current) return;
    setLoading(false);
    if (listed.ok) {
      setHosts(listed.value);
      setFresh(true);
      return listed;
    }
    setError(t.pairRefused[listed.code]);
    setFailure(
      listed.diagnostic ??
        connectionDiagnostic({
          code: listed.code,
          phase: 'environment-list',
          detail: listed.detail,
        }),
    );
    if (listed.code === 'sign-in-required') {
      setEmail(null);
      setHosts(undefined);
      setFresh(false);
      setSelected([]);
    }
    return listed;
  };
  useFocusEffect(
    useCallback(() => {
      const ticket = ++generation.current;
      actionKey.current = null;
      setPendingDeletion(false);
      setEmail(false);
      setLoading(false);
      setError(undefined);
      setFailure(undefined);
      setNotice(undefined);
      setManaging(false);
      setHosts(undefined);
      setSelected([]);
      void account
        .email()
        .then(async (current) => {
          if (ticket !== generation.current) return;
          actionKey.current = await account.actionKey();
          if (ticket !== generation.current) return;
          setPendingDeletion(await account.pendingDeletion());
          if (ticket !== generation.current) return;
          setEmail(current);
          if (current !== null) await load(ticket);
          if (ticket === generation.current) {
            const key = await account.actionKey();
            if (ticket === generation.current) actionKey.current = key;
          }
        })
        .catch((cause: unknown) => {
          if (ticket === generation.current) {
            setEmail(null);
            setLoading(false);
            setError(t.pairRefused['relay-unavailable']);
            setFailure(
              connectionDiagnostic({
                code: 'relay-unavailable',
                phase: 'account',
                detail: `relay:${networkDiagnosticReason(cause)}`,
              }),
            );
          }
        });
      return () => {
        generation.current += 1;
      };
    }, [t, account]),
  );

  const run = async (
    action:
      | 'signIn'
      | 'signOut'
      | 'deleteAccount'
      | 'finishLocalCleanup'
      | 'refresh'
      | 'revokeHost',
    confirmedKey?: string,
    hostId?: string,
  ) => {
    if (working.current || locked.current) return;
    working.current = true;
    const ticket = ++generation.current;
    setLoading(true);
    setError(undefined);
    setFailure(undefined);
    setNotice(undefined);
    try {
      if (action === 'refresh') await load(ticket);
      else {
        const result =
          action === 'signIn'
            ? await account.signIn()
            : action === 'revokeHost'
              ? await account.revokeHost(confirmedKey ?? '', hostId ?? '')
              : await account[action](confirmedKey ?? '');
        if (ticket !== generation.current) return;
        if (!result.ok) {
          if (result.code === 'sign-in-required') {
            setEmail(null);
            setHosts(undefined);
            setSelected([]);
          }
          if (action === 'revokeHost' && result.code === 'host-not-found') {
            const refreshed = await load(ticket);
            if (ticket !== generation.current) return;
            if (refreshed === undefined) return t.pairRefused['relay-unavailable'];
            if (!refreshed.ok) return t.pairRefused[refreshed.code];
            if (!refreshed.value.some((host) => host.id === hostId)) {
              setSelected((old) => old.filter((id) => id !== hostId));
              setNotice(t.pairAccount.alreadyUnlinked);
              return;
            }
          }
          setError(t.pairRefused[result.code]);
          setFailure(
            result.diagnostic ??
              connectionDiagnostic({
                code: result.code,
                phase: 'account-action',
                detail: result.detail,
              }),
          );
          return t.pairRefused[result.code];
        }
        setSelected([]);
        if (action === 'deleteAccount' || action === 'signOut' || action === 'finishLocalCleanup') {
          setEmail(null);
          setHosts(undefined);
        } else if (action === 'revokeHost') {
          if (result.value && typeof result.value === 'object')
            setNotice(
              result.value.sessionKnown ? t.pairAccount.unlinked : t.pairAccount.legacyUnlinked,
            );
          setHosts((old) => old?.filter((host) => host.id !== hostId));
          await load(ticket);
        } else {
          setEmail(typeof result.value === 'string' ? result.value : undefined);
          await load(ticket);
        }
      }
    } catch (cause: unknown) {
      if (ticket === generation.current) {
        setError(t.pairRefused['relay-unavailable']);
        setFailure(
          connectionDiagnostic({
            code: 'relay-unavailable',
            phase: action === 'refresh' ? 'environment-list' : 'account-action',
            detail: `relay:${networkDiagnosticReason(cause)}`,
          }),
        );
      }
      return t.pairRefused['relay-unavailable'];
    } finally {
      try {
        if (ticket === generation.current) {
          const key = await account.actionKey();
          const pending = await account.pendingDeletion();
          if (ticket === generation.current) {
            actionKey.current = key;
            setPendingDeletion(pending);
          }
        }
      } catch {
        if (ticket === generation.current) actionKey.current = null;
      }
      working.current = false;
      if (ticket === generation.current) setLoading(false);
    }
  };
  const confirm = (
    action: 'signOut' | 'deleteAccount' | 'finishLocalCleanup' | 'revokeHost',
    host?: ConnectHost,
  ) => {
    if (working.current || locked.current || !actionKey.current) return;
    let ticket = generation.current;
    const confirmedKey = actionKey.current;
    let used = false;
    const copy =
      action === 'revokeHost' && host
        ? [
            t.pairAccount.unlinkTitle(host.name),
            host.sessionKnown ? t.pairAccount.unlinkMessage : t.pairAccount.legacyUnlinkMessage,
            t.pairAccount.unlink,
          ]
        : action === 'finishLocalCleanup'
          ? [t.pairAccount.cleanupTitle, t.pairAccount.cleanupMessage, t.pairAccount.cleanupConfirm]
          : action === 'signOut'
            ? [t.pairAccount.signOutTitle, t.pairAccount.signOutMessage, t.pairAccount.signOut]
            : [t.pairAccount.deleteTitle, t.pairAccount.deleteMessage, t.pairAccount.deleteConfirm];
    confirmDestructive(copy[0]!, copy[1]!, copy[2]!, async () => {
      if (used || ticket !== generation.current || locked.current || working.current) return;
      const failure = await run(action, confirmedKey, host?.id);
      if (failure) {
        if (generation.current === ticket + 1) ticket = generation.current;
        throw new Error(failure);
      }
      used = true;
    });
  };
  const added = (host: ConnectHost) =>
    accountHostAdded(host, props.saved) ||
    props.results[host.id] === 'already-paired' ||
    props.results[host.id] === 'added';
  const eligible = (hosts ?? []).filter((host) => host.online && !added(host));
  const chosen = eligible.filter((host) => selected.includes(host.id));
  return (
    <AccountPanel
      email={email}
      pendingDeletion={pendingDeletion}
      loading={loading}
      busy={props.busy}
      error={error}
      failure={failure}
      notice={notice}
      managing={managing}
      managementDisabled={!fresh || pendingDeletion}
      onManage={() => {
        if (locked.current || working.current || pendingDeletion) return;
        setManaging((old) => !old);
        setSelected([]);
      }}
      onRevoke={(id) => {
        const host = hosts?.find((entry) => entry.id === id);
        if (managing && fresh && host && !pendingDeletion) confirm('revokeHost', host);
      }}
      rows={hosts?.map((host) => {
        const isAdded = added(host),
          result = props.results[host.id];
        const detail = managing
          ? host.online
            ? t.pairAccount.online
            : t.pairAccount.offline
          : isAdded
            ? t.pairAccount.added
            : result === 'cancelled'
              ? t.pairAccount.cancelled
              : result && result !== 'added'
                ? [t.pairRefused[result], props.failures?.[host.id]?.detail]
                    .filter((part) => part !== undefined)
                    .map((part, index) => (index === 0 ? part : t.pairFailureDetail(part)))
                    .join('\n')
                : host.online
                  ? t.pairAccount.online
                  : host.waiting
                    ? t.pairAccount.waiting
                    : t.pairAccount.offline;
        return {
          id: host.id,
          name: host.name,
          detail,
          ...(result &&
          result !== 'added' &&
          result !== 'cancelled' &&
          !isAdded &&
          props.pairing !== host.id &&
          props.failures?.[host.id]
            ? { failure: props.failures[host.id] }
            : {}),
          added: isAdded,
          disabled: isAdded || !host.online,
          selected: !isAdded && host.online && selected.includes(host.id),
          pairing: props.pairing === host.id,
        };
      })}
      selectedCount={chosen.length}
      onToggle={(id) => {
        if (props.busy || loading || !eligible.some((host) => host.id === id)) return;
        setSelected((old) =>
          old.includes(id) ? old.filter((value) => value !== id) : [...old, id],
        );
      }}
      onAdd={() => {
        if (!props.busy && !loading && chosen.length) void props.onPair(chosen);
      }}
      onRefresh={() => {
        props.onClearFailures?.();
        void run('refresh');
      }}
      onSignIn={() => void run('signIn')}
      onSignOut={() => confirm(pendingDeletion ? 'finishLocalCleanup' : 'signOut')}
      onDelete={() => confirm('deleteAccount')}
    />
  );
}
