import type { MemoryStandingUsage } from '@botharness/host-client/memory';
import type { ReactElement } from 'react';
import { Note } from './ds/note.js';
import type { BotHarnessTranslate } from './locale.js';

export function StandingImportUsage({
  standing,
  t,
}: {
  standing: readonly MemoryStandingUsage[];
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (standing.length === 0) return null;
  const count = (value: number) => value.toLocaleString('en-US');
  return (
    <div>
      {standing.map(({ path, chars, limit }) => (
        <Note key={path} tone={chars > limit ? 'warning' : 'muted'}>
          {t(chars > limit ? 'standing.import.over' : 'standing.import.within', {
            path,
            chars: count(chars),
            limit: count(limit),
            difference: count(Math.abs(limit - chars)),
          })}
        </Note>
      ))}
    </div>
  );
}
