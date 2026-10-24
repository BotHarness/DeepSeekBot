import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { ConnectAccount, ConnectHost } from '../host/connect-account';
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
    | 'signOut'
    | 'deleteAccount'
    | 'actionKey'
    | 'pendingDeletion'
    | 'finishLocalCleanup'
  >;
  busy: boolean;
  saved: readonly SavedHost[];
  results: Readonly<Record<string, AccountPairResult>>;
  onPair(hosts: ConnectHost[]): Promise<void>;
}) {
  const t = useStrings();
  const { account } = props;
  const [email, setEmail] = useState<string | undefined | null | false>(false);
  const [hosts, setHosts] = useState<ConnectHost[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [pendingDeletion, setPendingDeletion] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const generation = useRef(0);
  const working = useRef(false);
  const actionKey = useRef<string | null>(null);
  const locked = useRef(false);
  locked.current = props.busy || loading;

  const load = async (ticket: number): Promise<void> => {
    setLoading(true);
    setError(undefined);
    const listed = await account.hosts();
    if (ticket !== generation.current) return;
    setLoading(false);
    if (listed.ok) {
      setHosts(listed.value);
      return;
    }
    setError(t.pairRefused[listed.code]);
    if (listed.code === 'sign-in-required') {
      setEmail(null);
      setHosts(undefined);
      setSelected([]);
    }
  };
  useFocusEffect(
    useCallback(() => {
      const ticket = ++generation.current;
      actionKey.current = null;
      setPendingDeletion(false);
      setEmail(false);
      setLoading(false);
      setError(undefined);
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
        .catch(() => {
          if (ticket === generation.current) {
            setEmail(null);
            setLoading(false);
            setError(t.pairRefused['relay-unavailable']);
          }
        });
      return () => {
        generation.current += 1;
      };
    }, [t, account]),
  );

  const run = async (
    action: 'signIn' | 'signOut' | 'deleteAccount' | 'finishLocalCleanup' | 'refresh',
    confirmedKey?: string,
  ) => {
    if (working.current || locked.current) return;
    working.current = true;
    const ticket = ++generation.current;
    setLoading(true);
    setError(undefined);
    try {
      if (action === 'refresh') await load(ticket);
      else {
        const result =
          action === 'signIn' ? await account.signIn() : await account[action](confirmedKey ?? '');
        if (ticket !== generation.current) return;
        if (!result.ok) {
          setError(t.pairRefused[result.code]);
          return t.pairRefused[result.code];
        }
        setSelected([]);
        if (action === 'deleteAccount' || action === 'signOut' || action === 'finishLocalCleanup') {
          setEmail(null);
          setHosts(undefined);
        } else {
          setEmail(typeof result.value === 'string' ? result.value : undefined);
          await load(ticket);
        }
      }
    } catch {
      if (ticket === generation.current) setError(t.pairRefused['relay-unavailable']);
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
  const confirm = (action: 'signOut' | 'deleteAccount' | 'finishLocalCleanup') => {
    if (working.current || locked.current || !actionKey.current) return;
    let ticket = generation.current;
    const confirmedKey = actionKey.current;
    let used = false;
    const copy =
      action === 'finishLocalCleanup'
        ? [t.pairAccount.cleanupTitle, t.pairAccount.cleanupMessage, t.pairAccount.cleanupConfirm]
        : action === 'signOut'
          ? [t.pairAccount.signOutTitle, t.pairAccount.signOutMessage, t.pairAccount.signOut]
          : [t.pairAccount.deleteTitle, t.pairAccount.deleteMessage, t.pairAccount.deleteConfirm];
    confirmDestructive(copy[0]!, copy[1]!, copy[2]!, async () => {
      if (used || ticket !== generation.current || locked.current || working.current) return;
      const failure = await run(action, confirmedKey);
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
      rows={hosts?.map((host) => {
        const isAdded = added(host),
          result = props.results[host.id];
        const detail = isAdded
          ? t.pairAccount.added
          : result === 'cancelled'
            ? t.pairAccount.cancelled
            : result && result !== 'added'
              ? t.pairRefused[result]
              : host.online
                ? t.pairAccount.online
                : t.pairAccount.offline;
        return {
          id: host.id,
          name: host.name,
          detail,
          added: isAdded,
          disabled: isAdded || !host.online,
          selected: !isAdded && host.online && selected.includes(host.id),
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
      onRefresh={() => void run('refresh')}
      onSignIn={() => void run('signIn')}
      onSignOut={() => confirm(pendingDeletion ? 'finishLocalCleanup' : 'signOut')}
      onDelete={() => confirm('deleteAccount')}
    />
  );
}
