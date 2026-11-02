import { useRef, useState } from 'react';
import type { RosterBot } from '../../host/client';
import { errorText } from '../../host/bot-settings';
import { t } from '../strings';
import { useMounted } from '../mounted';

export interface InviteSheetProps {
  candidates: RosterBot[];
  onInvite(bot: RosterBot): Promise<void>;
  onClose(): void;
}

export function useInviteSelection({ candidates, onInvite, onClose }: InviteSheetProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const alive = useRef(false);
  const sending = useRef(false);
  const completed = useRef(new Set<string>());
  const mount = useMounted<unknown>(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const eligible = candidates.filter((bot) => !completed.current.has(bot.slug));
  const chosen = eligible.filter((bot) => selected.has(bot.slug));
  const toggle = (slug: string) => {
    if (sending.current) return;
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };
  const confirm = async () => {
    if (sending.current || chosen.length === 0) return;
    sending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      for (const bot of chosen) {
        if (!alive.current) return;
        await onInvite(bot);
        completed.current.add(bot.slug);
        if (!alive.current) return;
        setSelected((previous) => new Set([...previous].filter((slug) => slug !== bot.slug)));
      }
      if (alive.current) onClose();
    } catch (failure) {
      if (alive.current) setError(`${t.groupFailed} ${errorText(failure)}`);
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return {
    mount,
    eligible,
    selected,
    busy,
    error,
    canConfirm: chosen.length > 0 && !busy,
    toggle,
    confirm,
  };
}
