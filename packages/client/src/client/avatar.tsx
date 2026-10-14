import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { buildCss, presetForState, resolveOptions } from '@botharness/botui-core';
import { attentionCount } from './activity-attention.js';

import type {
  PersonaBotAttention,
  PersonaBotSessionActivity,
} from '../../../core/src/state/bot-state.js';
import type { PersonaBotToolActivity } from '../../../core/src/state/tool-activity.js';

import { blobatar } from 'blobatar';

import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import {
  isAvatarAppearance,
  type AvatarAppearance,
  type PixelMouthState,
  type RetainedAvatarAppearance,
  pixelSymbolFor,
} from '../../../core/src/bots/avatar-appearance.js';
import { resolvedAvatarRecipe } from '../../../core/src/bots/primary-color.js';
import { IllustratedAvatar } from './illustrated-avatar.js';
import { createAvatarAnchor, type AvatarAnchor } from './avatar-anchor.js';
import { useMountedResource } from './mounted-resource.js';

export const PERSONA_BOT_ACTIVITY_STATES = [
  'idle',
  'thinking',
  'working',
  'waiting',
  'blocked',
] as const;

export type PersonaBotActivityState = (typeof PERSONA_BOT_ACTIVITY_STATES)[number];

export type PersonaBotActivityEffect =
  | 'thinking-dots'
  | 'searching'
  | 'coding'
  | 'executing'
  | 'generic-working';

export interface PersonaBotAvatarProps {
  personaBotId: string;
  name: string;
  size: number;
  src?: string | undefined;
  appearance?: AvatarAppearance | RetainedAvatarAppearance | undefined;
  avatarSeed?: 2 | undefined;
  state?: PersonaBotActivityState | undefined;
  effect?: PersonaBotActivityEffect | undefined;
  activity?: PersonaBotToolActivity | undefined;
  attention?: PersonaBotAttention | undefined;
  indicator?: boolean | undefined;
  t?: BotHarnessTranslate | undefined;
  className?: string | undefined;
  surface?: 'portrait' | 'companion' | undefined;
  still?: boolean | undefined;
  mouth?: PixelMouthState | undefined;
  facing?: 'front' | 'left' | 'right' | undefined;
  anchorRef?: ((anchor: AvatarAnchor | undefined) => void) | undefined;
  nativeTitle?: boolean | undefined;
}

export interface PersonaBotFacepileItem {
  sessions?: readonly PersonaBotSessionActivity[] | undefined;
  personaBotId: string;
  name: string;
  src?: string | undefined;
  appearance?: AvatarAppearance | RetainedAvatarAppearance | undefined;
  avatarSeed?: 2 | undefined;
  state?: PersonaBotActivityState | undefined;
  effect?: PersonaBotActivityEffect | undefined;
  activity?: PersonaBotToolActivity | undefined;
  attention?: PersonaBotAttention | undefined;
}

const FALLBACK_HUES = [225, 262, 12, 152, 47, 200];

function fallbackMarkup(seed: string): string {
  const hue = FALLBACK_HUES[seed.length % FALLBACK_HUES.length] ?? 225;
  const initial = seed.slice(0, 1).toUpperCase();
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="46" fill="hsl(${hue} 70% 62%)"/><text x="50" y="62" text-anchor="middle" font-size="42" fill="white">${initial}</text></svg>`;
}

export function normalizePersonaBotActivity(value: unknown): PersonaBotActivityState {
  return PERSONA_BOT_ACTIVITY_STATES.includes(value as PersonaBotActivityState)
    ? (value as PersonaBotActivityState)
    : 'idle';
}

export function defaultActivityEffect(
  state: PersonaBotActivityState,
): PersonaBotActivityEffect | undefined {
  if (state === 'thinking') return 'thinking-dots';
  if (state === 'working') return 'generic-working';
  return undefined;
}

export function personaBotActivityLabel(
  state: PersonaBotActivityState,
  t: BotHarnessTranslate = zhTranslate,
): string {
  switch (state) {
    case 'idle':
      return t('activity.idle');
    case 'thinking':
      return t('activity.thinking');
    case 'working':
      return t('activity.working');
    case 'waiting':
      return t('activity.waiting');
    case 'blocked':
      return t('activity.blocked');
  }
}

export function personaBotActivitySources(
  activity: PersonaBotToolActivity | undefined,
  t: BotHarnessTranslate = zhTranslate,
): string | undefined {
  return activity?.sources
    ?.map(({ role, count }) => {
      const label = t(`activity.source.${role}`);
      return count > 1 ? t('activity.sourceCount', { label, count }) : label;
    })
    .join(' / ');
}

export function personaBotActivitySummary(
  state: PersonaBotActivityState,
  activity: PersonaBotToolActivity | undefined,
  t: BotHarnessTranslate = zhTranslate,
): string {
  if (state !== 'working' || activity === undefined) return personaBotActivityLabel(state, t);
  const label =
    activity.effect === 'searching'
      ? t('activity.searching')
      : activity.effect === 'coding'
        ? t('activity.coding')
        : activity.effect === 'executing'
          ? t('activity.executing')
          : t('activity.working');
  return [
    label,
    activity.toolName,
    activity.publicDetail,
    personaBotActivitySources(activity, t),
    activity.activeToolCount > 1
      ? t('activity.toolCount', { count: activity.activeToolCount })
      : undefined,
  ]
    .filter((value) => value !== undefined)
    .join(' · ');
}

export function personaBotPresentationSummary(
  state: PersonaBotActivityState,
  activity: PersonaBotToolActivity | undefined,
  attention: PersonaBotAttention | undefined,
  t: BotHarnessTranslate = zhTranslate,
): string {
  return [
    personaBotActivitySummary(state, activity, t),
    attention?.approvalCount
      ? t('activity.approvalCount', { count: attention.approvalCount })
      : undefined,
    attention?.questionCount
      ? t(attention.questionCount === 1 ? 'activity.questionCountOne' : 'activity.questionCount', {
          count: attention.questionCount,
        })
      : undefined,
    attention?.waitingHumanCount
      ? t(
          attention.waitingHumanCount === 1
            ? 'activity.waitingHumanCountOne'
            : 'activity.waitingHumanCount',
          { count: attention.waitingHumanCount },
        )
      : undefined,
    attention?.workspaceGrantCount
      ? t(
          attention.workspaceGrantCount === 1
            ? 'activity.workspaceGrantCountOne'
            : 'activity.workspaceGrantCount',
          { count: attention.workspaceGrantCount },
        )
      : undefined,
    attention?.informationalCount
      ? t(
          attention.informationalCount === 1
            ? 'activity.informationalCountOne'
            : 'activity.informationalCount',
          { count: attention.informationalCount },
        )
      : undefined,
    attention?.blockedCount
      ? t(attention.blockedCount === 1 ? 'activity.blockedCountOne' : 'activity.blockedCount', {
          count: attention.blockedCount,
        })
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function BlobatarMedia({ seed }: { seed: string }): ReactElement {
  const markup = useMemo(() => {
    try {
      return blobatar(`botharness:${seed}`);
    } catch {
      return fallbackMarkup(seed);
    }
  }, [seed]);

  return <span className="bh-avatar-media" dangerouslySetInnerHTML={{ __html: markup }} />;
}

function AvatarMedia({
  personaBotId,
  name,
  src,
}: {
  personaBotId: string;
  name: string;
  src?: string | undefined;
}): ReactElement {
  const [failedSrc, setFailedSrc] = useState<string | undefined>(undefined);

  if (src !== undefined && src.length > 0 && failedSrc !== src) {
    return (
      <span className="bh-avatar-media bh-avatar-media-image">
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => {
            setFailedSrc(src);
          }}
        />
      </span>
    );
  }

  return <BlobatarMedia seed={personaBotId || name} />;
}

function BotUIActivityIndicator({ state }: { state: 'thinking' | 'working' }): ReactElement {
  const mount = useCallback(
    (element: HTMLSpanElement | null) => {
      if (element === null) return;
      const matrix = buildCss(
        resolveOptions({
          preset: presetForState(state),
          renderer: 'css',
          size: 12,
          cols: 3,
          rows: 3,
          silhouette: 'square',
          dot: 'circle',
          dotSize: 1,
          gapX: 0.15,
          gapY: 0.15,
          grow: 0,
          color: 'inherit',
        }),
      );
      element.replaceChildren(...(matrix === null ? [] : [matrix]));
    },
    [state],
  );
  return (
    <span ref={mount} className="bh-avatar-botui" data-botui-state={state} aria-hidden="true" />
  );
}

function ActivityIndicator({ state }: { state: PersonaBotActivityState }): ReactElement | null {
  if (state === 'idle') return null;
  if (state === 'thinking' || state === 'working') return <BotUIActivityIndicator state={state} />;
  return <span className="bh-avatar-indicator" aria-hidden="true" />;
}

function AttentionBadge({
  attention,
}: {
  attention: PersonaBotAvatarProps['attention'];
}): ReactElement | null {
  if (attention !== undefined && attentionCount(attention) > 0)
    return (
      <span
        className="bh-avatar-attention"
        data-approval-count={attention.approvalCount}
        data-question-count={attention.questionCount ?? 0}
        data-waiting-human-count={attention.waitingHumanCount ?? 0}
        data-workspace-grant-count={attention.workspaceGrantCount ?? 0}
        data-blocked-count={attention.blockedCount ?? 0}
        aria-hidden="true"
      >
        {attentionCount(attention) > 99 ? '99+' : attentionCount(attention)}
      </span>
    );
  if (attention?.informationalCount)
    return (
      <span
        className="bh-avatar-information"
        data-informational-count={attention.informationalCount}
        aria-hidden="true"
      >
        i
      </span>
    );
  return null;
}

export function PersonaBotStatusBadges({
  state = 'idle',
  attention,
}: Pick<PersonaBotAvatarProps, 'state' | 'attention'>): ReactElement | null {
  const indicator = <ActivityIndicator state={state} />;
  const badge = <AttentionBadge attention={attention} />;
  if (
    state === 'idle' &&
    (attention === undefined || (attentionCount(attention) === 0 && !attention.informationalCount))
  )
    return null;
  return (
    <span className="bh-row-status" data-state={state}>
      {indicator}
      {badge}
    </span>
  );
}

const EFFECT_ACTIVITY: Record<string, Pick<PersonaBotToolActivity, 'toolKind'>> = {
  searching: { toolKind: 'search' },
  coding: { toolKind: 'edit' },
  executing: { toolKind: 'execute' },
  'generic-working': { toolKind: 'other' },
};

export function PersonaBotAvatar({
  personaBotId,
  name,
  size,
  src,
  appearance,
  avatarSeed,
  state = 'idle',
  effect,
  activity,
  attention,
  indicator = true,
  className,
  surface = 'portrait',
  still = false,
  mouth = 'saved',
  facing,
  anchorRef,
  nativeTitle = true,
  t = zhTranslate,
}: PersonaBotAvatarProps): ReactElement {
  const resolvedEffect =
    effect ?? (state === 'working' ? activity?.effect : undefined) ?? defaultActivityEffect(state);
  const summary = personaBotPresentationSummary(state, activity, attention, t);
  const composed = isAvatarAppearance(appearance);
  const seeded = !composed && (src === undefined || src.length === 0);
  const seededRecipe = useMemo(
    () =>
      seeded
        ? resolvedAvatarRecipe({ slug: personaBotId, displayName: name, avatarSeed })
        : undefined,
    [seeded, name, personaBotId, avatarSeed],
  );
  const mediaKind = composed ? 'composed' : seeded ? 'seeded' : 'image';
  const active = !still && (state === 'thinking' || state === 'working');
  const classes = ['bh-persona-avatar', className].filter(Boolean).join(' ');
  const anchorMount = useMountedResource<HTMLSpanElement>(
    (node) => {
      if (!anchorRef || surface !== 'companion') return;
      anchorRef(createAvatarAnchor(node));
      return () => anchorRef(undefined);
    },
    [anchorRef, appearance, seededRecipe, src, size, state, surface, facing],
  );

  return (
    <span
      ref={anchorMount}
      className={classes}
      style={{ width: size, height: size }}
      data-state={state}
      data-surface={surface}
      data-effect={resolvedEffect}
      data-media={mediaKind}
      data-active={active ? 'true' : 'false'}
      title={nativeTitle ? `${name} · ${summary}` : undefined}
      role="img"
      aria-label={t('avatar.label', { name, activity: summary })}
    >
      {composed || seededRecipe ? (
        <IllustratedAvatar
          personaBotId={personaBotId}
          recipe={composed ? appearance.recipe : seededRecipe!}
          state={state}
          effect={resolvedEffect ?? 'generic-working'}
          size={size}
          symbol={pixelSymbolFor(
            state,
            activity ?? EFFECT_ACTIVITY[resolvedEffect ?? 'generic-working'],
            attention?.approvalCount ?? 0,
          )}
          surface={surface}
          still={still}
          mouth={mouth}
          facing={facing}
        />
      ) : (
        <AvatarMedia key={src ?? ''} personaBotId={personaBotId} name={name} src={src} />
      )}
      {indicator ? <ActivityIndicator state={state} /> : null}
      {indicator ? <AttentionBadge attention={attention} /> : null}
    </span>
  );
}

export function personaBotActivityPreview(
  items: readonly PersonaBotFacepileItem[],
  max = 3,
): readonly PersonaBotFacepileItem[] {
  const active = (item: PersonaBotFacepileItem) =>
    item.state === 'thinking' || item.state === 'working';
  return [...items.filter(active), ...items.filter((item) => !active(item))].slice(
    0,
    Math.min(max, 3),
  );
}

export function PersonaBotFacepile({
  items,
  renderAvatar,
  indicator = true,
  size,
  max = 3,
  className,
  t = zhTranslate,
}: {
  items: readonly PersonaBotFacepileItem[];
  renderAvatar?: ((item: PersonaBotFacepileItem, avatar: ReactElement) => ReactElement) | undefined;
  indicator?: boolean | undefined;
  size: number;
  max?: number | undefined;
  className?: string | undefined;
  t?: BotHarnessTranslate | undefined;
}): ReactElement | null {
  if (items.length === 0) return null;
  const visible = personaBotActivityPreview(items, max);
  const overflow = items.length - visible.length;
  return (
    <span className={['bh-avatar-facepile', className].filter(Boolean).join(' ')}>
      {visible.map((item) => {
        const avatar = (
          <PersonaBotAvatar
            key={item.personaBotId}
            {...item}
            size={size}
            indicator={indicator}
            t={t}
          />
        );
        return renderAvatar === undefined ? avatar : renderAvatar(item, avatar);
      })}
      {overflow > 0 ? (
        <span className="bh-avatar-facepile-overflow" style={{ width: size, height: size }}>
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

export function Blobatar({ seed, size }: { seed: string; size: number }): ReactElement {
  return (
    <PersonaBotAvatar
      personaBotId={seed}
      name={seed}
      size={size}
      indicator={false}
      t={zhTranslate}
    />
  );
}
