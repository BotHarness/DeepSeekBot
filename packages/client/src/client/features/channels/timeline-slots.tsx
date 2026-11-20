import { useTimelineSlots, type TimelineWindow } from '../../timeline-window.js';
import type { ReactElement } from 'react';

export function TimelineSlots({
  timeline,
  keys,
  renderGroup,
}: {
  timeline: TimelineWindow;
  keys: readonly string[];
  renderGroup: (index: number) => ReactElement;
}): ReactElement {
  const slots = useTimelineSlots(timeline);
  return (
    <>
      {timeline.chunks.map((chunk) => (
        <div key={chunk.id} className="bh-timeline-chunk">
          {slots.slice(chunk.start, chunk.end).map((slot) =>
            slot.placeholder !== undefined ? (
              <div
                key={keys[slot.index]}
                className="bh-timeline-slot bh-timeline-gap"
                aria-hidden="true"
                style={{ height: slot.placeholder }}
              />
            ) : (
              <div key={keys[slot.index]} className="bh-timeline-slot">
                {renderGroup(slot.index)}
              </div>
            ),
          )}
        </div>
      ))}
    </>
  );
}
