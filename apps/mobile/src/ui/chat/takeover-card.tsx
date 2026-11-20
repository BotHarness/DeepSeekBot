import { useState } from 'react';
import { useRouter } from 'expo-router';

import type { HostClient } from '@botharness/host-client/client';
import { useHostSession } from '../../host/host-session';
import type { RequestRef } from '@botharness/host-client/requests';
import { Button } from '../primitives/button';
import { useStrings } from '../strings';
import { ActionCard, CardButtons, CardNote, CardPreview } from './action-card';
import type { BubbleGroup } from './bubble-shape';
import { CardLine } from './card-line';

export type TakeoverOutcome = 'done' | 'failed' | 'cancelled' | 'expired';

export function TakeoverCard({
  client,
  target,
  takeover,
  sentence,
  outcome,
  focused = false,
  group,
}: {
  client: Pick<HostClient, 'call'>;
  target: RequestRef;
  takeover: { target: 'computer' | 'browser'; title: string; expiresAt: string };
  sentence: string;
  outcome: TakeoverOutcome | undefined;
  focused?: boolean;
  group?: BubbleGroup;
}) {
  const t = useStrings();
  const router = useRouter();
  const { saved } = useHostSession();
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState<TakeoverOutcome>();
  const [error, setError] = useState<string>();
  const category = t.takeoverCategory[takeover.target];
  const ended =
    settled ?? outcome ?? (Date.parse(takeover.expiresAt) <= Date.now() ? 'expired' : undefined);
  if (ended !== undefined)
    return (
      <CardLine
        text={t.cardLine(`${category} · ${takeover.title}`, t.takeoverOutcome[ended])}
        tone={ended === 'done' ? 'success' : ended === 'failed' ? 'danger' : 'subtle'}
        focused={focused}
        {...(group === undefined ? {} : { group })}
      />
    );
  const settle = (next: 'done' | 'failed' | 'cancelled'): void => {
    setBusy(true);
    setError(undefined);
    client
      .call<{ takeover?: { status?: string } }>(
        next === 'cancelled' ? 'takeoverCancel' : 'takeoverComplete',
        next === 'cancelled'
          ? { channelId: target.channelId, messageId: target.messageId, surface: 'mobile' }
          : {
              channelId: target.channelId,
              messageId: target.messageId,
              outcome: next,
              surface: 'mobile',
            },
      )
      .then(
        (result) => {
          const recorded = result?.takeover?.status;
          setSettled(
            recorded === 'done' ||
              recorded === 'failed' ||
              recorded === 'cancelled' ||
              recorded === 'expired'
              ? recorded
              : next,
          );
        },
        () => setError(t.takeoverError),
      )
      .finally(() => setBusy(false));
  };
  return (
    <ActionCard
      category={category}
      status={t.needsYou}
      title={takeover.title}
      focused={focused}
      busy={busy}
      {...(error === undefined ? {} : { error })}
      preview={<CardPreview text={sentence} well={false} variant="body" />}
    >
      <CardNote>{t.takeoverNote}</CardNote>
      <Button
        variant="card-solid"
        testID="takeover-open"
        label={t.takeoverOpen}
        tone="primary"
        onPress={() =>
          router.push({
            pathname: takeover.target === 'computer' ? '/computer/[slug]' : '/browser/[slug]',
            params: { slug: target.botSlug, hostId: saved?.hostId ?? '' },
          })
        }
      />
      <CardButtons>
        <Button
          variant="card-solid"
          testID="takeover-done"
          label={t.takeoverDone}
          onPress={() => settle('done')}
        />
        <Button
          variant="card-solid"
          testID="takeover-failed"
          label={t.takeoverFailed}
          onPress={() => settle('failed')}
        />
        <Button
          variant="card-solid"
          testID="takeover-cancel"
          label={t.takeoverCancel}
          onPress={() => settle('cancelled')}
        />
      </CardButtons>
    </ActionCard>
  );
}
