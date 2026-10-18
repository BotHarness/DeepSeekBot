import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { botRoutines } from '../../host/routines';
import { errorText } from '../../host/bot-settings';
import { fullClientParams } from '../../host/full-client';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import type { BotScheduleSummary } from '../../host/wire';
import { SheetPage } from '../primitives/sheet-page';
import { t } from '../strings';
import { RoutineSheet } from './routine-sheet';
import { SheetFailed, SheetLoading, SheetNote } from './sheet';

export function RoutineScreen({ edit = false }: { edit?: boolean }) {
  const { slug, id } = useLocalSearchParams<{ slug: string; id?: string }>();
  const router = useRouter();
  const { client, saved } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  const routines = useMemo(
    () => (client === undefined ? undefined : botRoutines(client, slug)),
    [client, slug],
  );
  const [entry, setEntry] = useState<BotScheduleSummary>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      if (id !== undefined && routines !== undefined) {
        void routines.list().then(
          (rows) => {
            if (!live) return;
            const next = rows.find((row) => row.id === id);
            setEntry(next);
            setError(next === undefined ? t.routineNotFound : undefined);
          },
          (cause: unknown) => {
            if (live) setError(errorText(cause));
          },
        );
      }
      return () => {
        live = false;
      };
    }, [routines, id, attempt]),
  );
  const title =
    id === undefined
      ? t.routineNew
      : edit
        ? t.routineEditTitle
        : (entry?.title ?? t.profileSection.routines);
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title }} />
      {bot === undefined || routines === undefined ? (
        <SheetNote>{t.noBot}</SheetNote>
      ) : id !== undefined && entry === undefined ? (
        error === undefined ? (
          <SheetLoading />
        ) : (
          <SheetFailed message={error} onRetry={() => setAttempt((value) => value + 1)} />
        )
      ) : (
        <>
          {error === undefined ? null : (
            <SheetFailed message={error} onRetry={() => setAttempt((value) => value + 1)} />
          )}
          <RoutineSheet
            key={`${saved?.hostId}:${slug}:${JSON.stringify(entry)}`}
            page={SheetPage}
            {...(edit ? { initialMode: 'edit' } : {})}
            botName={bot.displayName}
            target={entry === undefined ? { kind: 'new' } : { kind: 'open', routine: entry }}
            routines={routines}
            onChanged={() => undefined}
            onClose={() => router.back()}
            onEdit={() =>
              router.push({ pathname: '/bot/[slug]/routine-edit/[id]', params: { slug, id: id! } })
            }
            onOpenFullClient={() =>
              router.push({
                pathname: '/full-client',
                params: fullClientParams({ kind: 'dm', slug }),
              })
            }
          />
        </>
      )}
    </View>
  );
}
