import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { ConnectAccount, ConnectHost } from '../host/connect-account';
import type { SavedHost } from '../host/hosts';
import { accountHostAdded } from '../host/account-pairing';
import { confirmDestructive } from './primitives/app-dialog';
import { AccountPanel, type AccountPairResult } from './primitives/account-panel';
import { t } from './strings';

export function AccountHosts(props: {
  account: Pick<ConnectAccount, 'email' | 'signIn' | 'hosts' | 'signOut' | 'deleteAccount'>;
  busy: boolean;
  saved: readonly SavedHost[];
  results: Readonly<Record<string, AccountPairResult>>;
  onPair(hosts: ConnectHost[]): Promise<void>;
}) {
  const { account } = props;
  const [email, setEmail] = useState<string | undefined | null | false>(false);
  const [hosts, setHosts] = useState<ConnectHost[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const generation = useRef(0);
  const working = useRef(false);

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
      setEmail(false);
      setLoading(false);
      setError(undefined);
      setHosts(undefined);
      setSelected([]);
      void account
        .email()
        .then(async (current) => {
          if (ticket !== generation.current) return;
          setEmail(current);
          if (current !== null) await load(ticket);
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
    }, [account]),
  );

  const run = async (action: 'signIn' | 'signOut' | 'deleteAccount' | 'refresh') => {
    if (working.current || props.busy || loading) return;
    working.current = true;
    const ticket = ++generation.current;
    setLoading(true);
    setError(undefined);
    try {
      if (action === 'refresh') await load(ticket);
      else if (action === 'signOut') {
        await account.signOut();
        if (ticket === generation.current) {
          setEmail(null);
          setHosts(undefined);
          setSelected([]);
        }
      } else {
        const result = await account[action]();
        if (ticket !== generation.current) return;
        if (!result.ok) {
          setError(t.pairRefused[result.code]);
          return;
        }
        setSelected([]);
        if (action === 'deleteAccount') {
          setEmail(null);
          setHosts(undefined);
        } else {
          setEmail(typeof result.value === 'string' ? result.value : undefined);
          await load(ticket);
        }
      }
    } catch {
      if (ticket === generation.current) setError(t.pairRefused['relay-unavailable']);
    } finally {
      working.current = false;
      if (ticket === generation.current) setLoading(false);
    }
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
      onSignOut={() => void run('signOut')}
      onDelete={() =>
        confirmDestructive(
          t.pairAccount.deleteTitle,
          t.pairAccount.deleteMessage,
          t.pairAccount.deleteConfirm,
          () => run('deleteAccount'),
        )
      }
    />
  );
}
