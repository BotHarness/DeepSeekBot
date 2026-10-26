import type { ReactElement } from 'react';
import {
  PersonaBotFacepile,
  personaBotActivitySummary,
  type PersonaBotFacepileItem,
} from './avatar.js';
import { attentionCount } from './activity-attention.js';
import type { ChannelComposerActivity } from './channel-composer.js';
import type { BotHarnessTranslate } from './locale.js';

const MAX_WORKING_ROWS = 3;

export interface TimelineWorkingRows {
  items: readonly PersonaBotFacepileItem[];
  more: number;
}

export function timelineWorkingRows(
  activity: ChannelComposerActivity | undefined,
  streamingBotSlugs: ReadonlySet<string>,
  latestAuthorBotSlug?: string | undefined,
): TimelineWorkingRows {
  const active = (activity?.items ?? []).filter(
    (item) =>
      (item.state === 'working' ||
        (item.state === 'thinking' && item.personaBotId !== latestAuthorBotSlug)) &&
      attentionCount(item.attention) === 0 &&
      !streamingBotSlugs.has(item.personaBotId),
  );
  return {
    items: active.slice(0, MAX_WORKING_ROWS),
    more: Math.max(0, active.length - MAX_WORKING_ROWS),
  };
}

function rowActivity(
  activity: PersonaBotFacepileItem['activity'],
): PersonaBotFacepileItem['activity'] {
  if (activity === undefined) return undefined;
  const { sources: _sources, ...rest } = activity;
  return { ...rest, activeToolCount: 1 };
}

export function timelineWorkingRowsCover(
  activity: ChannelComposerActivity | undefined,
  rows: TimelineWorkingRows,
  streamingBotSlugs: ReadonlySet<string>,
): boolean {
  const shown = new Set(rows.items.map((item) => item.personaBotId));
  return (
    activity !== undefined &&
    activity.items.length > 0 &&
    activity.items.every(
      (item) =>
        (shown.has(item.personaBotId) || streamingBotSlugs.has(item.personaBotId)) &&
        (item.attention?.informationalCount ?? 0) === 0,
    )
  );
}

function workingSummary(rows: TimelineWorkingRows, t: BotHarnessTranslate): string {
  const [only] = rows.items;
  if (only === undefined) return '';
  const summary =
    rows.items.length === 1 && rows.more === 0
      ? personaBotActivitySummary(only.state ?? 'idle', rowActivity(only.activity), t)
      : personaBotActivitySummary('working', undefined, t);
  return rows.more > 0 ? `${summary} · ${t('main.activity.more', { count: rows.more })}` : summary;
}

export function WorkingSummary({
  rows,
  t,
}: {
  rows: TimelineWorkingRows;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <span className="bh-header-working-summary" aria-hidden="true">
      {workingSummary(rows, t)}
      <span className="bh-header-working-ellipsis">
        <i>.</i>
        <i>.</i>
        <i>.</i>
      </span>
    </span>
  );
}

export function HeaderWorkingStatus({
  rows,
  t,
}: {
  rows: TimelineWorkingRows;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (rows.items.length === 0) return null;
  return (
    <span className="bh-header-working" aria-hidden="true">
      <PersonaBotFacepile
        className="bh-header-working-avatars"
        items={rows.items}
        size={22}
        max={MAX_WORKING_ROWS}
        indicator={false}
        t={t}
      />
      <WorkingSummary rows={rows} t={t} />
    </span>
  );
}
