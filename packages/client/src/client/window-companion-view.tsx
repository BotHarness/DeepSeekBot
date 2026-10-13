import {
  useCallback,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import {
  Menu,
  IconEllipsisOutlineRegular,
  IconCloseFillRegular,
  IconNewChatOutlineRegular,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { PersonaBotAvatar, personaBotPresentationSummary } from './avatar.js';
import { attentionCount } from './activity-attention.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotHarnessTranslate } from './locale.js';
import type { CompanionBot } from '../../../core/src/companions/feed.js';
import type { CompanionViewState, WindowCompanion } from './window-companion.js';
import { CompanionMotion, type CompanionPoint } from './companion-motion.js';
import { CompanionBubbles, type BubblePlacement } from './companion-bubbles.js';
import { CompanionFrames, type CompanionFrameTask } from './companion-frames.js';
import { isAvatarAppearance } from '../../../core/src/bots/avatar-appearance.js';
import { companionMessageIdentity } from '../../../core/src/companions/sources.js';
import { companionBabble, type CompanionSound } from './companion-sound.js';
import type { BridgeActions } from './actions.js';
import { CompanionRequests } from './companion-requests-view.js';
import type { AvatarAnchor } from './avatar-anchor.js';

function avatarLimitation(
  bot: CompanionBot | undefined,
): 'imageOnly' | 'rigUnavailable' | undefined {
  if (bot?.appearance && !isAvatarAppearance(bot.appearance)) return 'rigUnavailable';
  if (bot?.avatar && !bot.appearance) return 'imageOnly';
  return;
}
const statusVisible = (state: CompanionViewState): boolean =>
  Boolean(
    (state.selection?.activity && state.activity && state.activity.state !== 'idle') ||
    state.bot?.paused ||
    avatarLimitation(state.bot) ||
    state.sync !== 'live',
  );

const tails = new Set<HTMLElement>();
const followTails = (): void => {
  const targets = [...tails]
    .filter((node) => node.isConnected)
    .map((node) => [node, Math.max(0, node.scrollHeight - node.clientHeight)] as const);
  tails.clear();
  for (const [node, top] of targets) node.scrollTop = top;
};
const followTail = (node: HTMLElement): void => {
  if (!tails.size) queueMicrotask(followTails);
  tails.add(node);
};

function CompanionMessageText({ text, context }: { text: string; context: boolean }): ReactElement {
  const following = useRef(true);
  const viewport = useMountedResource<HTMLParagraphElement>(
    (node) => {
      if (following.current) followTail(node);
    },
    [text, context],
  );
  return (
    <p
      ref={viewport}
      data-context={context}
      tabIndex={0}
      onScroll={(event) => {
        const node = event.currentTarget;
        following.current = node.scrollHeight - node.clientHeight - node.scrollTop <= 1;
      }}
    >
      {text}
    </p>
  );
}

export interface WindowCompanionViewProps {
  companion: WindowCompanion;
  openDm(botId: string): void;
  openAttention(): void;
  openChannel(channelId: string, messageId: string): void | Promise<void>;
  t: BotHarnessTranslate;
  onRemove?(botId: string): void;
  bubbles?: CompanionBubbles | undefined;
  frames?: CompanionFrames | undefined;
  openSettings?(): void;
  sound?: CompanionSound | undefined;
  actions?: BridgeActions | undefined;
}
export function WindowCompanionView({
  companion,
  openDm,
  openAttention,
  openChannel,
  t,
  onRemove,
  bubbles,
  frames,
  openSettings,
  sound,
  actions,
}: WindowCompanionViewProps): ReactElement | null {
  const view = useSyncExternalStore(companion.subscribe, companion.getSnapshot);
  const latest = useRef(view);
  latest.current = view;
  const audio = useRef(sound);
  audio.current = sound;
  const audible = useRef(false);
  const [motion] = useState(
    () =>
      new CompanionMotion((event) => {
        const state = latest.current;
        if (
          audible.current &&
          !document.hidden &&
          document.documentElement.dataset['botharnessMotion'] !== 'reduce' &&
          state.selection &&
          state.bot &&
          !state.bot.paused &&
          state.sync === 'live'
        )
          audio.current?.interact(state.selection.botId, event);
      }),
  );
  const [point, setPoint] = useState(motion.point);
  const presentPoint = useRef<(next: CompanionPoint) => void>(setPoint);
  const motionFrameAt = useRef(performance.now());
  const displayedPoint = useRef(point);
  displayedPoint.current = point;
  const anchor = useRef<AvatarAnchor | undefined>(undefined);
  const viewport = useRef({ left: 0, bottom: window.innerHeight, height: window.innerHeight });
  const anchorRef = useCallback((value: AvatarAnchor | undefined) => {
    anchor.current = value;
  }, []);
  const [localBubbles] = useState(() => new CompanionBubbles());
  const bubbleOwner = bubbles ?? localBubbles;
  const [localFrames] = useState(() => new CompanionFrames());
  const frameOwner = frames ?? localFrames;
  const [bubble, setBubble] = useState<BubblePlacement | undefined>(undefined);
  const root = useRef<HTMLDivElement | null>(null);
  const character = useRef<HTMLButtonElement | null>(null);
  const pointer = useRef<
    | {
        id: number;
        x: number;
        y: number;
        lastX: number;
        lastY: number;
        originX: number;
        originY: number;
        moved: boolean;
      }
    | undefined
  >(undefined);
  const direction = useRef(1);
  const hovering = useRef(false);
  const exit = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clickReset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressClick = useRef(false);
  const [menu, setMenu] = useState(false);
  const menuClass = `bh-companion-menu-${useId()}`;
  const menuTrigger = useRef<HTMLElement | null>(null);
  const focusMenu = useMountedResource<HTMLSpanElement>(() => {
    menuTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => {
      document
        .getElementsByClassName(menuClass)
        .item(0)
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [menuClass]);
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(() => new Set());
  const menuOpen = useRef(false);
  menuOpen.current = menu;
  const reducedMotion = (): boolean =>
    document.documentElement.dataset['botharnessMotion'] === 'reduce';
  const persistPosition = (): void => companion.configure({ position: motion.position() });
  const releaseMotion = (cancelled = false): void => {
    const now = performance.now();
    motionFrameAt.current = now;
    presentPoint.current(motion.release(now, reducedMotion(), cancelled));
  };
  const cancelDrag = (event: { pointerId: number }): void => {
    if (!pointer.current || pointer.current.id !== event.pointerId || motion.point.phase !== 'drag')
      return;
    pointer.current = undefined;
    releaseMotion(true);
    persistPosition();
  };
  const leave = (): void => {
    hovering.current = false;
    if (exit.current !== undefined) clearTimeout(exit.current);
    exit.current = setTimeout(() => {
      exit.current = undefined;
      if (
        (root.current?.contains(document.activeElement) &&
          document.activeElement?.matches(':focus-visible')) ||
        hovering.current ||
        menuOpen.current
      )
        return;
      companion.reading(false);
    }, 800);
  };
  const enter = (): void => {
    hovering.current = true;
    if (exit.current !== undefined) clearTimeout(exit.current);
    companion.reading(true);
  };
  const closeMenu = (): void => {
    const returnFocus = document
      .getElementsByClassName(menuClass)
      .item(0)
      ?.contains(document.activeElement)
      ? menuTrigger.current
      : null;
    setMenu(false);
    leave();
    if (returnFocus) {
      queueMicrotask(() => {
        if (returnFocus.isConnected) returnFocus.focus();
      });
    }
  };
  const mount = useMountedResource<HTMLDivElement>(
    (node) => {
      root.current = node;
      let previous = performance.now();
      let elapsed = 0;
      let measured = false;
      let visible = true;
      let stageVisible = true;
      const syncAudio = () => {
        const state = companion.getSnapshot();
        if (!state.selection || !state.bot || state.bot.paused || state.sync !== 'live')
          sound?.stop(state.selection?.botId ?? view.selection?.botId);
        else if (!state.cards.length) sound?.stopSpeech(state.selection.botId);
      };
      const unsubscribeAudio = companion.subscribe(syncAudio);
      const placeBubble = (next: CompanionPoint, sampled: ReturnType<AvatarAnchor['read']>) => {
        const state = latest.current;
        if (state.selection) {
          if (statusVisible(state) || state.cards.length || state.requests.length) {
            const placement = bubbleOwner.place(
              state.selection.botId,
              next.x,
              next.y,
              next.width,
              viewport.current.height,
              state.requests.length
                ? 4
                : state.reading
                  ? state.cards.length
                  : Math.min(state.cards.length, state.capacity.layers),
              state.reading || state.requests.length > 0,
              sampled
                ? {
                    x: next.x + sampled.x - viewport.current.left - displayedPoint.current.x,
                    y: next.y + viewport.current.bottom - sampled.y - displayedPoint.current.y,
                  }
                : undefined,
            );
            setBubble((previous) =>
              previous?.bottom === placement.bottom &&
              previous?.originX === placement.originX &&
              previous?.originY === placement.originY &&
              previous?.left === placement?.left &&
              previous?.cardHeight === placement?.cardHeight
                ? previous
                : placement,
            );
          } else {
            bubbleOwner.remove(state.selection.botId);
            setBubble(undefined);
          }
        }
      };
      presentPoint.current = (next) => {
        placeBubble(next, anchor.current?.read());
        setPoint(next);
      };
      const measure = () => {
        const box = node.getBoundingClientRect();
        const width = box.width;
        viewport.current = {
          left: box.left,
          bottom: box.bottom,
          height: box.height || window.innerHeight,
        };
        const next = measured
          ? motion.resize(width, viewport.current.height)
          : motion.measure(
              width,
              viewport.current.height,
              latest.current.selection?.position ?? 0.75,
            );
        measured = true;
        const drag = pointer.current;
        if (drag) {
          drag.x = drag.lastX;
          drag.y = drag.lastY;
          drag.originX = next.x;
          drag.originY = next.y;
        }
        presentPoint.current(next);
      };
      let sampled: ReturnType<AvatarAnchor['read']>;
      const tick = (now: number) => {
        const milliseconds = Math.max(0, now - previous);
        const motionMilliseconds = Math.max(0, now - motionFrameAt.current);
        motionFrameAt.current = now;
        previous = now;
        const reduced = reducedMotion();
        const state = latest.current;
        if (!document.hidden && stageVisible) {
          if (visible) elapsed += Math.min(100, milliseconds);
          if (elapsed >= 50) {
            const before = companion.getSnapshot().cards;
            companion.advance(elapsed, reduced);
            const after = companion.getSnapshot();
            if (!reduced && after.sync === 'live' && after.bot && !after.bot.paused) {
              const text = companionBabble(before, after.cards);
              if (text) sound?.play(after.bot.slug, text);
            }
            elapsed = 0;
          }
          const walking = Boolean(
            state.selection?.walking &&
            visible &&
            state.bot?.paused !== true &&
            state.sync === 'live' &&
            !state.reading &&
            motion.point.phase === 'rest' &&
            !pointer.current &&
            !reduced,
          );
          const previousPoint = motion.point;
          const next = motion.advance(motionMilliseconds, reduced, walking, direction.current);
          placeBubble(next, sampled);
          if (walking && (next.x <= 8 || next.x >= Math.max(8, next.width - 104)))
            direction.current *= -1;
          if (next !== previousPoint) setPoint(next);
          if (previousPoint.phase !== 'rest' && next.phase === 'rest') persistPosition();
        }
        sampled = undefined;
        if (document.hidden || !stageVisible) frameOwner.stop(task);
      };
      const task: CompanionFrameTask = {
        read: () => {
          const state = latest.current;
          sampled =
            !document.hidden &&
            stageVisible &&
            (statusVisible(state) || state.cards.length || state.requests.length)
              ? anchor.current?.read()
              : undefined;
        },
        write: tick,
      };
      const visibility = () => {
        audible.current = !document.hidden && stageVisible && visible;
        if (document.hidden || !stageVisible || !visible)
          sound?.stop(latest.current.selection?.botId);
        frameOwner.stop(task);
        previous = performance.now();
        motionFrameAt.current = previous;
        elapsed = 0;
        if (!document.hidden && stageVisible) frameOwner.start(task);
      };
      const observer =
        typeof IntersectionObserver === 'undefined'
          ? undefined
          : new IntersectionObserver((entries) => {
              for (const entry of entries) {
                if (entry.target === node) stageVisible = entry.isIntersecting;
                else visible = entry.isIntersecting;
              }
              visibility();
            });
      observer?.observe(node);
      const target = node.querySelector('.bh-companion');
      if (target) observer?.observe(target);
      const policy = new MutationObserver(() => {
        if (reducedMotion()) {
          sound?.stop(latest.current.selection?.botId);
          presentPoint.current(motion.advance(0, true, false, direction.current));
        }
      });
      policy.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-botharness-motion'],
      });
      measure();
      visibility();
      window.addEventListener('resize', measure);
      document.addEventListener('visibilitychange', visibility);
      return () => {
        audible.current = false;
        unsubscribeAudio();
        sound?.stop(latest.current.selection?.botId ?? view.selection?.botId);
        frameOwner.stop(task);
        observer?.disconnect();
        policy.disconnect();
        window.removeEventListener('resize', measure);
        document.removeEventListener('visibilitychange', visibility);
        if (exit.current !== undefined) clearTimeout(exit.current);
        if (clickReset.current !== undefined) clearTimeout(clickReset.current);
        pointer.current = undefined;
        presentPoint.current = setPoint;
        if (latest.current.selection) bubbleOwner.remove(latest.current.selection.botId);
        root.current = null;
      };
    },
    [companion, view.selection?.botId, bubbleOwner, frameOwner, sound],
  );
  if (!view.selection || !view.bot) return null;
  const { selection, bot, activity } = view;
  const state = bot.paused ? 'idle' : (activity?.state ?? 'idle');
  const limitationKey = avatarLimitation(bot);
  const limitation = limitationKey ? t(`companion.${limitationKey}`) : undefined;
  const attention = activity?.attention;
  const items: MenuEntry[] = [
    {
      id: 'activity',
      label: t('companion.activity'),
      icon: <span aria-hidden="true">{selection.activity ? '✓' : ''}</span>,
    },
    {
      id: 'dm',
      label: t('companion.dm'),
      icon: <span aria-hidden="true">{selection.dm ? '✓' : ''}</span>,
    },
    {
      id: 'group',
      label: t('companion.group'),
      icon: <span aria-hidden="true">{selection.group ? '✓' : ''}</span>,
    },
    { type: 'separator', id: 'scope-separator' },
    ...(['own-dm', 'shared', 'all-bot'] as const).map((scope) => ({
      id: scope,
      label: t(`companion.scope.${scope}`),
      icon: <span aria-hidden="true">{selection.visibility === scope ? '✓' : ''}</span>,
    })),
    { type: 'separator', id: 'walking-separator' },
    { id: 'walking', label: t(selection.walking ? 'companion.pause' : 'companion.walk') },
    { type: 'separator', id: 'remove-separator' },
    ...(openSettings ? [{ id: 'settings', label: t('companion.settings') }] : []),
    { id: 'remove', label: t('companion.remove') },
  ];
  const cards = view.reading ? view.cards : view.cards.slice(-view.capacity.layers);
  const bubbleLeft = bubble
    ? bubble.left - point.x
    : Math.max(-point.x + 8, Math.min(-108, point.width - point.x - 328));
  const bubbleBottom = (bubble?.bottom ?? point.y + 134) - point.y;
  const connector =
    bubble && (statusVisible(view) || view.cards.length || view.requests.length)
      ? {
          x: Math.max(
            bubble.left + 12,
            Math.min(bubble.originX, bubble.left + Math.min(308, point.width - 28)),
          ),
          y: viewport.current.height - bubble.bottom - (statusVisible(view) ? 0 : 40),
        }
      : undefined;
  return (
    <div ref={mount} className="bh-root bh-companion-stage">
      {connector && bubble ? (
        <svg className="bh-companion-tether" aria-hidden="true">
          <path
            d={`M ${bubble.originX} ${viewport.current.height - bubble.originY} V ${connector.y + 8} H ${connector.x} V ${connector.y}`}
          />
        </svg>
      ) : null}
      <section
        className="bh-companion"
        aria-label={t('companion.label', { name: bot.name })}
        data-bh-tour="companion"
        data-reading={view.reading}
        data-static={bot.paused}
        data-sync={view.sync}
        data-motion={point.phase}
        data-bot={bot.slug}
        style={{
          left: 0,
          bottom: 0,
          transform: `translate3d(${point.x}px, ${-point.y}px, 0)`,
          zIndex: view.reading ? 10 : 1,
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menu) {
            event.preventDefault();
            setMenu(false);
            character.current?.focus();
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          enter();
          setMenu(true);
        }}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocusCapture={(event) => {
          if (event.target.matches(':focus-visible')) enter();
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) leave();
        }}
      >
        {statusVisible(view) ? (
          <div
            className="bh-companion-activity"
            style={{ left: bubbleLeft, bottom: bubbleBottom }}
            role="status"
          >
            {view.sync !== 'live'
              ? t('companion.stale')
              : bot.paused
                ? t('companion.archived')
                : personaBotPresentationSummary(state, activity?.activity, undefined, t)}
            {limitation ? ` · ${limitation}` : null}
          </div>
        ) : null}
        {view.requests.length ? (
          <CompanionRequests
            requests={view.requests}
            messageCount={view.cards.length + view.pending}
            actions={actions}
            live={view.sync === 'live' && !bot.paused}
            t={t}
            restoreFocus={() => {
              if (character.current?.isConnected) character.current.focus();
            }}
            style={{
              left: bubbleLeft,
              bottom: bubbleBottom + 40,
              maxHeight:
                bubble?.cardHeight ??
                Math.min(
                  448,
                  Math.max(112, viewport.current.height - point.y - bubbleBottom - 40 - 16),
                ),
            }}
          />
        ) : view.cards.length ? (
          <ol
            className="bh-companion-cards"
            aria-label={t('companion.messages')}
            style={{
              left: bubbleLeft,
              bottom: bubbleBottom + 40,
              height: view.reading
                ? (bubble?.cardHeight ??
                  Math.min(
                    cards.length * 112,
                    Math.max(112, viewport.current.height - point.y - bubbleBottom - 40 - 16),
                  ))
                : 112,
            }}
          >
            {cards.map((card, index) => {
              const identity = companionMessageIdentity(card.channelId, card.messageId);
              const layer = cards.length - index - 1;
              const context = [
                card.source === 'bot-dm' ? card.participants?.join(' ↔ ') : '',
                card.canOpen === false || unavailable.has(identity)
                  ? t('companion.sourceUnavailable')
                  : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <li
                  key={identity}
                  ref={(node) => {
                    if (node) node.inert = !view.reading && layer !== 0;
                  }}
                  className="bh-companion-card"
                  style={{
                    top: view.reading ? index * 112 : 0,
                    transform: view.reading
                      ? 'none'
                      : `translateY(${-layer * 8}px) scale(${1 - layer * 0.04})`,
                    zIndex: view.reading ? 1 : index + 1,
                  }}
                  aria-hidden={!view.reading && layer !== 0}
                >
                  <header>
                    <div className="bh-companion-source">
                      <button
                        type="button"
                        disabled={card.canOpen === false}
                        title={
                          card.canOpen === false ? t('companion.sourceUnavailable') : undefined
                        }
                        onClick={async () => {
                          if (card.canOpen === false) return;
                          try {
                            await openChannel(card.channelId, card.messageId);
                            setUnavailable(
                              (prior) => new Set([...prior].filter((id) => id !== identity)),
                            );
                          } catch {
                            setUnavailable(
                              (prior) =>
                                new Set([...prior, identity].slice(-view.capacity.retention)),
                            );
                          }
                        }}
                      >
                        {t(
                          card.source === 'shared-group' || card.source === 'bot-group'
                            ? 'companion.sourceGroup'
                            : 'companion.source',
                          { name: card.channelName },
                        )}
                      </button>
                      {context && <small title={context}>{context}</small>}
                    </div>
                    <button
                      type="button"
                      aria-label={t('companion.dismiss')}
                      onClick={(event) => {
                        if (document.activeElement === event.currentTarget) {
                          const controls = [
                            ...root.current!.querySelectorAll<HTMLButtonElement>(
                              '.bh-companion-card header > button',
                            ),
                          ];
                          const current = controls.indexOf(event.currentTarget);
                          (
                            controls[current + 1] ??
                            controls[current - 1] ??
                            character.current
                          )?.focus();
                        }
                        companion.dismiss(card.messageId, card.channelId);
                      }}
                    >
                      <IconCloseFillRegular size={14} />
                    </button>
                  </header>
                  <CompanionMessageText
                    text={card.body.slice(0, card.shown)}
                    context={Boolean(context)}
                  />
                </li>
              );
            })}
          </ol>
        ) : null}
        <div className="bh-companion-toolbar" data-open={menu}>
          <button
            type="button"
            aria-label={t('companion.openDm')}
            title={t('companion.openDm')}
            onClick={() => openDm(bot.slug)}
          >
            <IconNewChatOutlineRegular size={16} />
          </button>
          <button
            type="button"
            aria-label={t(selection.walking ? 'companion.pause' : 'companion.walk')}
            title={t(selection.walking ? 'companion.pause' : 'companion.walk')}
            aria-pressed={!selection.walking}
            onClick={() => companion.configure({ walking: !selection.walking })}
          >
            {selection.walking ? 'Ⅱ' : '▷'}
          </button>
          {menu ? <span ref={focusMenu} aria-hidden="true" /> : null}
          <Menu
            open={menu}
            onClose={closeMenu}
            items={items}
            dense
            side="top"
            portal
            autoFocus
            listClassName={menuClass}
            anchor={
              <button
                type="button"
                aria-label={t('companion.more')}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <IconEllipsisOutlineRegular size={16} />
              </button>
            }
            onSelect={(id) => {
              if (id === 'remove') {
                const pin = [
                  ...document.querySelectorAll<HTMLButtonElement>('[data-companion-pin]'),
                ].find((item) => item.dataset['companionPin'] === bot.slug);
                const next = [
                  ...document.querySelectorAll<HTMLButtonElement>('.bh-companion-character'),
                ].find((item) => item !== character.current);
                (pin ?? next)?.focus();
                if (onRemove) onRemove(bot.slug);
                else companion.remove();
              }
              if (id === 'activity') companion.configure({ activity: !selection.activity });
              if (id === 'dm') companion.configure({ dm: !selection.dm });
              if (id === 'group') companion.configure({ group: !selection.group });
              if (id === 'walking') companion.configure({ walking: !selection.walking });
              if (id === 'settings') openSettings?.();
              if (id === 'own-dm' || id === 'shared' || id === 'all-bot')
                companion.configure({ visibility: id });
              closeMenu();
            }}
          />
          {view.pending ? <span role="status">+{view.pending}</span> : null}
        </div>
        {attentionCount(attention) > 0 || attention?.informationalCount ? (
          <button
            type="button"
            className="bh-companion-attention"
            aria-label={t('companion.attention')}
            onClick={openAttention}
          >
            {attentionCount(attention) || 'i'}
          </button>
        ) : null}
        <button
          type="button"
          className="bh-companion-character"
          ref={character}
          style={{
            rotate: `${point.tilt}deg`,
            transform: `scale(${1 + point.squash}, ${1 - point.squash})`,
          }}
          aria-label={t('companion.drag', { name: bot.name })}
          onClick={() => {
            if (!suppressClick.current) openDm(bot.slug);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
              event.preventDefault();
              enter();
              setMenu(true);
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              presentPoint.current(
                motion.move(motion.point.x + (event.key === 'ArrowLeft' ? -24 : 24)),
              );
              persistPosition();
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || pointer.current) return;
            if (clickReset.current !== undefined) clearTimeout(clickReset.current);
            suppressClick.current = false;
            event.currentTarget.setPointerCapture(event.pointerId);
            pointer.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              lastX: event.clientX,
              lastY: event.clientY,
              originX: motion.point.x,
              originY: motion.point.y,
              moved: false,
            };
            presentPoint.current(motion.grab(performance.now(), reducedMotion()));
          }}
          onPointerMove={(event) => {
            const drag = pointer.current;
            if (!drag || drag.id !== event.pointerId) return;
            const dx = event.clientX - drag.x;
            const dy = drag.y - event.clientY;
            drag.lastX = event.clientX;
            drag.lastY = event.clientY;
            drag.moved ||= Math.hypot(dx, dy) > 6;
            if (!drag.moved) return;
            presentPoint.current(
              motion.drag(drag.originX + dx, drag.originY + dy, performance.now(), reducedMotion()),
            );
          }}
          onPointerUp={(event) => {
            const drag = pointer.current;
            if (!drag || drag.id !== event.pointerId) return;
            pointer.current = undefined;
            suppressClick.current = drag.moved;
            event.currentTarget.releasePointerCapture(event.pointerId);
            if (drag.moved) {
              releaseMotion();
              persistPosition();
              event.preventDefault();
              clickReset.current = setTimeout(() => {
                clickReset.current = undefined;
                suppressClick.current = false;
              }, 0);
            } else {
              releaseMotion(true);
            }
          }}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={cancelDrag}
        >
          <PersonaBotAvatar
            personaBotId={bot.slug}
            name={bot.name}
            size={96}
            src={bot.avatar}
            appearance={bot.appearance}
            avatarSeed={bot.avatarSeed}
            state={state}
            activity={activity?.activity}
            surface="companion"
            anchorRef={anchorRef}
            mouth={view.mouth}
            indicator={false}
            still={bot.paused}
            t={t}
          />
        </button>
      </section>
    </div>
  );
}
