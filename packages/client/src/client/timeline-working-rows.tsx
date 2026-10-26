import { useState, type ReactElement } from 'react';
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

export function TimelineWorkingRowsView({
  rows,
  t,
}: {
  rows: TimelineWorkingRows;
  t: BotHarnessTranslate;
}): ReactElement {
  const open = rows.items.length > 0;
  const [kept, setKept] = useState(rows);
  if (open && kept !== rows) setKept(rows);
  const shown = open ? rows : kept;
  const [only] = shown.items;
  const summary =
    only === undefined
      ? ''
      : shown.items.length === 1 && shown.more === 0
        ? personaBotActivitySummary(only.state ?? 'idle', rowActivity(only.activity), t)
        : personaBotActivitySummary('working', undefined, t);
  return (
    <div className="bh-timeline-working" data-open={open} aria-hidden="true">
      <div className="bh-timeline-working-clip">
        {only === undefined ? null : (
          <div className="bh-timeline-working-row">
            <PersonaBotFacepile
              className="bh-timeline-working-avatars"
              items={shown.items}
              size={28}
              max={MAX_WORKING_ROWS}
              indicator={false}
              t={t}
            />
            <span className="bh-timeline-working-summary">
              {shown.more > 0
                ? `${summary} · ${t('main.activity.more', { count: shown.more })}`
                : summary}
              <span className="bh-timeline-working-ellipsis">
                <i>.</i>
                <i>.</i>
                <i>.</i>
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
