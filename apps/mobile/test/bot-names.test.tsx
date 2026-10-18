// @vitest-environment jsdom
import { act, memo } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';

import { useBotNames } from '../src/ui/chat/use-bot-names';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('does not invalidate a historical row for status updates, but does for renames and Host changes', async () => {
  let renders = 0;
  const Row = memo(function Row({ name }: { name: (id: string) => string }) {
    renders++;
    return (
      <span>
        {name('bot-a')} / {name('missing')}
      </span>
    );
  });
  function Chat({ bots }: { bots: Array<{ slug: string; displayName: string; status: string }> }) {
    return <Row name={useBotNames(bots)} />;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  const update = (displayName: string, status: string) =>
    act(async () => root.render(<Chat bots={[{ slug: 'bot-a', displayName, status }]} />));
  try {
    await update('Alice', 'idle');
    expect(renders).toBe(1);
    await update('Alice', 'working');
    await update('Alice', 'idle');
    expect(renders).toBe(1);
    await update('Renamed', 'idle');
    expect(renders).toBe(2);
    expect(container.textContent).toBe('Renamed / missing');
    await update('Other Host', 'idle');
    expect(renders).toBe(3);
    expect(container.textContent).toBe('Other Host / missing');
  } finally {
    await act(async () => root.unmount());
  }
});
