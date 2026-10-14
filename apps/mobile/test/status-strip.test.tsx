import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { RosterBot } from '../src/host/client';
import { MethodRefused } from '../src/host/client';
import { stopBot } from '../src/host/stop';

vi.mock('react-native', () => {
  const host = (name: string) => {
    const Component = ({ children, ...props }: Record<string, unknown>) => {
      const attributes: Record<string, string> = {};
      for (const key of ['accessibilityLabel', 'accessibilityRole', 'disabled'])
        if (props[key] !== undefined) attributes[`data-${key.toLowerCase()}`] = String(props[key]);
      const content =
        typeof children === 'function' ? (children as (s: object) => unknown)({}) : children;
      return (
        <div data-native={name} {...attributes}>
          {content as never}
        </div>
      );
    };
    return Component;
  };
  return {
    View: host('View'),
    Text: host('Text'),
    Pressable: host('Pressable'),
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options['ios'] },
    useColorScheme: () => 'light',
  };
});
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

const { StatusStrip } = await import('../src/ui/chat/status-strip');
const { stepLabel, stepRows } = await import('../src/ui/chat/bot-steps');
const { t } = await import('../src/ui/strings');

const mika: RosterBot = {
  slug: 'mika',
  displayName: 'Mika',
  roles: [],
  computerAccess: false,
  browserAccess: false,
  state: 'working',
  paused: false,
  dmChannelId: 'dm-mika',
  activity: { effect: 'executing', toolName: 'bash', activeToolCount: 1 },
  sessions: [
    {
      id: 'orchestrator-1',
      role: 'orchestrator',
      name: '[Human DM] Channel: dm-mika',
      state: 'working',
      activity: { effect: 'executing', toolName: 'bash', activeToolCount: 1 },
    },
    {
      id: 'assignment-1',
      role: 'assignment',
      name: 'Fix the release notes',
      state: 'thinking',
    },
  ],
};

describe('working status strip', () => {
  it('shows the current step and a Stop button named for the Bot', () => {
    const html = renderToStaticMarkup(
      <StatusStrip bot={mika} stopping={false} onStop={() => {}} />,
    );
    expect(html).toContain(`Mika · ${t.effect.executing} · bash…`);
    expect(html).toContain(`data-accessibilitylabel="${t.stopBot('Mika')}"`);
    expect(html).toContain(t.stop);
    expect(html).not.toContain('Fix the release notes');
  });

  it('shows Stopping while the Host ends the turn', () => {
    const html = renderToStaticMarkup(<StatusStrip bot={mika} stopping onStop={() => {}} />);
    expect(html).toContain(t.stopping);
  });

  it('lists each working Session without internal names', () => {
    expect(stepRows(mika)).toEqual([
      { key: 'orchestrator-1', who: t.stepRole.orchestrator, what: `${t.effect.executing} · bash` },
      { key: 'assignment-1', who: 'Fix the release notes', what: t.state.thinking },
    ]);
    expect(stepLabel(undefined, 'working')).toBe(t.state.working);
    expect(stepLabel({ effect: 'thinking-dots', activeToolCount: 0 }, 'thinking')).toBe(
      t.state.thinking,
    );
  });
});

describe('stopping a Bot', () => {
  it('calls the Host with the DM and the Bot, and reads a refusal by its code', async () => {
    const calls: Array<[string, unknown]> = [];
    const ok = {
      call: async <T,>(method: string, args?: Record<string, unknown>) => {
        calls.push([method, args]);
        return {} as T;
      },
    };
    expect(await stopBot(ok, 'dm-mika', 'mika')).toEqual({ status: 'stopped' });
    expect(calls).toEqual([['channelBotStop', { channelId: 'dm-mika', botSlug: 'mika' }]]);
    const idle = {
      call: async <T,>(): Promise<T> => {
        throw new MethodRefused('not-working', 'Mika is not working right now');
      },
    };
    expect(await stopBot(idle, 'dm-mika', 'mika')).toEqual({ status: 'not-working' });
    const down = {
      call: async <T,>(): Promise<T> => {
        throw new Error('The Host could not be reached.');
      },
    };
    expect(await stopBot(down, 'dm-mika', 'mika')).toEqual({
      status: 'failed',
      reason: 'The Host could not be reached.',
    });
  });
});
