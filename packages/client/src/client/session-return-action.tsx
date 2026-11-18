import { Button } from './ds/button.js';
import { useRef, useState, type RefCallback, type ReactElement } from 'react';

import { MenuItemButton } from './ds/menu.js';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';

import { PersonaBotAvatar } from './avatar.js';
import { BotIcon } from './bot-icon.js';
import type { SessionBotOwner } from './bridge.js';
import { LOCALE_NS } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import {
  markSessionsTourSeen,
  startDshSessionsTour,
  takeSessionsTourPending,
} from './onboarding-sessions-tour.js';

export interface SessionReturnInjected {
  resolveOwner: (sessionId: string, signal: AbortSignal) => Promise<SessionBotOwner | undefined>;
  returnToBot: (botSlug: string) => Promise<void>;
}

export type SessionReturnActionProps = PropsRuntime<'conversation.session.header.actions'> &
  PropsLocale<typeof LOCALE_NS> &
  InjectFace<SessionReturnInjected>;

export type SessionReturnMenuItemProps = PropsRuntime<'sidebar.workspaces.session.menu.item'> &
  PropsLocale<typeof LOCALE_NS> &
  InjectFace<SessionReturnInjected>;

export type SessionOwnerLeadingProps = PropsRuntime<'sidebar.session.row.leading'> &
  PropsLocale<typeof LOCALE_NS> &
  InjectFace<Pick<SessionReturnInjected, 'resolveOwner'>>;

interface SessionOwnerResolution {
  sessionId: string;
  owner?: SessionBotOwner;
}

function useSessionOwner(
  sessionId: string,
  resolveOwner: SessionReturnInjected['resolveOwner'],
  onScopeMount?: () => void,
): {
  resolution: SessionOwnerResolution | undefined;
  mount: RefCallback<HTMLSpanElement>;
  generation: React.RefObject<number>;
} {
  const [resolved, setResolved] = useState<SessionOwnerResolution>();
  const generation = useRef(0);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    ++generation.current;
    onScopeMount?.();
    const controller = new AbortController();
    void resolveOwner(sessionId, controller.signal)
      .then((owner) => {
        if (!controller.signal.aborted)
          setResolved(owner === undefined ? { sessionId } : { sessionId, owner });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResolved({ sessionId });
      });
    return () => {
      ++generation.current;
      controller.abort();
    };
  }, [sessionId, resolveOwner]);
  return {
    resolution: resolved?.sessionId === sessionId ? resolved : undefined,
    mount,
    generation,
  };
}

export function SessionReturnAction({
  sessionId,
  resolveOwner,
  returnToBot,
  t,
}: SessionReturnActionProps): ReactElement | null {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const { resolution, mount, generation } = useSessionOwner(sessionId, resolveOwner, () => {
    setBusy(false);
    setFailed(false);
  });
  const owner = resolution?.owner;

  const open = async (): Promise<void> => {
    if (owner === undefined) return;
    const requestGeneration = generation.current;
    setBusy(true);
    setFailed(false);
    try {
      await returnToBot(owner.botSlug);
    } catch {
      if (generation.current === requestGeneration) setFailed(true);
    } finally {
      if (generation.current === requestGeneration) setBusy(false);
    }
  };
  const tourMount = useMountedResource<HTMLSpanElement>(() => {
    markSessionsTourSeen();
    const shownSteps = takeSessionsTourPending();
    if (shownSteps === undefined) return;
    return startDshSessionsTour(t, sessionId, shownSteps, () => void open());
  }, [sessionId, owner?.botSlug]);
  return (
    <>
      <span ref={mount} hidden aria-hidden="true" />
      {owner === undefined ? null : <span ref={tourMount} hidden aria-hidden="true" />}
      {owner === undefined ? null : (
        <Button
          variant="ghost"
          size="sm"
          className="bh-session-return-action"
          icon={
            <PersonaBotAvatar
              personaBotId={owner.botSlug}
              name={owner.displayName}
              src={owner.avatar}
              appearance={owner.appearance}
              avatarSeed={owner.avatarSeed}
              size={20}
              indicator={false}
              t={t}
            />
          }
          disabled={busy}
          onClick={() => void open()}
        >
          {failed
            ? t('sessions.return.failed')
            : t('sessions.return.action', { name: owner.displayName })}
        </Button>
      )}
    </>
  );
}

export function SessionOwnerLeading({
  sessionId,
  resolveOwner,
  t,
}: SessionOwnerLeadingProps): ReactElement | null {
  const { resolution, mount } = useSessionOwner(sessionId, resolveOwner);
  const owner = resolution?.owner;
  return (
    <>
      <span ref={mount} hidden aria-hidden="true" />
      {resolution === undefined ? null : owner === undefined ? (
        <span hidden data-bh-native-session-owner="unowned" data-session-id={sessionId} />
      ) : (
        <PersonaBotAvatar
          personaBotId={owner.botSlug}
          name={owner.displayName}
          src={owner.avatar}
          appearance={owner.appearance}
          avatarSeed={owner.avatarSeed}
          size={16}
          indicator={false}
          className="bh-native-session-owner"
          t={t}
        />
      )}
    </>
  );
}

export function SessionReturnMenuItem({
  sessionId,
  useMenuOpenState,
  resolveOwner,
  returnToBot,
  t,
}: SessionReturnMenuItemProps): ReactElement | null {
  const [, setMenuOpen] = useMenuOpenState();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const { resolution, mount, generation } = useSessionOwner(sessionId, resolveOwner, () => {
    setBusy(false);
    setFailed(false);
  });
  const owner = resolution?.owner;

  return (
    <>
      <span ref={mount} hidden aria-hidden="true" />
      {owner === undefined ? null : (
        <MenuItemButton
          icon={<BotIcon icon="bot" size={16} />}
          disabled={busy}
          separatorBefore
          onSelect={() => {
            const requestGeneration = generation.current;
            setBusy(true);
            setFailed(false);
            void returnToBot(owner.botSlug)
              .then(() => {
                if (generation.current === requestGeneration) setMenuOpen(false);
              })
              .catch(() => {
                if (generation.current === requestGeneration) setFailed(true);
              })
              .finally(() => {
                if (generation.current === requestGeneration) setBusy(false);
              });
          }}
        >
          {failed ? t('sessions.return.failed') : t('sessions.return.label')}
        </MenuItemButton>
      )}
    </>
  );
}
