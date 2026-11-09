import { describe, expect, it } from 'vitest';
import { createConnectionLifetime } from '../src/host/connection-lifetime';

describe('paired connection lifetime', () => {
  it('keeps a call connected without background notifications and releases only its Host', () => {
    const events: string[] = [];
    const host = (id: string) => ({
      start: () => {
        events.push(`${id}:start`);
      },
      stop: () => {
        events.push(`${id}:stop`);
      },
    });
    const callHost = host('call');
    const otherHost = host('other');
    const lifetime = createConnectionLifetime(true);
    lifetime.add(callHost);
    lifetime.add(otherHost);
    const releaseCall = lifetime.retain(callHost);
    lifetime.foreground(false);
    expect(events).toEqual(['call:start', 'other:start', 'other:stop']);
    expect(lifetime.backgroundAllowed(callHost)).toBe(false);
    releaseCall();
    releaseCall();
    expect(events).toEqual(['call:start', 'other:start', 'other:stop', 'call:stop']);
  });

  it('releases independent demands without stopping a newer call or opted-in notifications', () => {
    const events: string[] = [];
    const connection = {
      start: () => {
        events.push('start');
      },
      stop: () => {
        events.push('stop');
      },
    };
    const lifetime = createConnectionLifetime(true);
    lifetime.add(connection);
    const first = lifetime.retain(connection);
    const second = lifetime.retain(connection);
    lifetime.foreground(false);
    first();
    first();
    expect(events).toEqual(['start']);
    lifetime.backgroundRunning(true);
    lifetime.allowBackground(connection, true);
    second();
    expect(events).toEqual(['start']);
    lifetime.backgroundRunning(false);
    expect(events).toEqual(['start', 'stop']);
  });

  it('does not let a call revive a refused or removed connection', () => {
    const events: string[] = [];
    const connection = {
      start: () => {
        events.push('start');
      },
      stop: () => {
        events.push('stop');
      },
    };
    const lifetime = createConnectionLifetime(true);
    lifetime.add(connection);
    const old = lifetime.retain(connection);
    lifetime.foreground(false);
    lifetime.remove(connection);
    expect(events).toEqual(['start', 'stop']);
    lifetime.add(connection);
    const current = lifetime.retain(connection);
    old();
    expect(events).toEqual(['start', 'stop', 'start']);
    lifetime.refused(connection);
    current();
    lifetime.retain(connection)();
    lifetime.foreground(true);
    expect(events).toEqual(['start', 'stop', 'start']);
  });

  it('keeps only opted-in Hosts in background and releases each demand independently', () => {
    const events: string[] = [];
    const host = (id: string) => ({
      start: () => {
        events.push(`${id}:start`);
      },
      stop: () => {
        events.push(`${id}:stop`);
      },
    });
    const a = host('a');
    const b = host('b');
    const lifetime = createConnectionLifetime(true);
    lifetime.add(a);
    lifetime.add(b);
    lifetime.backgroundRunning(true);
    lifetime.allowBackground(a, true);
    lifetime.foreground(false);
    expect(events).toEqual(['a:start', 'b:start', 'b:stop']);
    lifetime.allowBackground(b, true);
    lifetime.remove(a);
    expect(events.slice(-2)).toEqual(['b:start', 'a:stop']);
    lifetime.foreground(true);
    lifetime.backgroundRunning(false);
    expect(events.at(-1)).toBe('a:stop');
    lifetime.foreground(false);
    expect(events.at(-1)).toBe('b:stop');
  });

  it('does not revive a refused credential through foreground or preference changes', () => {
    let starts = 0;
    const connection = {
      start: () => {
        starts++;
      },
      stop() {},
    };
    const lifetime = createConnectionLifetime(true);
    lifetime.add(connection);
    lifetime.allowBackground(connection, true);
    lifetime.refused(connection);
    lifetime.foreground(false);
    lifetime.backgroundRunning(true);
    lifetime.foreground(true);
    lifetime.add(connection);
    expect(starts).toBe(1);
  });

  it('stopping background mode preserves foreground chat and releases connections on leaving', () => {
    const changes: string[] = [];
    const connection = {
      start: () => {
        changes.push('connected');
      },
      stop: () => {
        changes.push('stopped');
      },
    };
    const lifetime = createConnectionLifetime(true);
    lifetime.add(connection);
    lifetime.backgroundRunning(true);
    lifetime.backgroundRunning(false);
    expect(changes).toEqual(['connected']);
    lifetime.foreground(false);
    expect(changes).toEqual(['connected', 'stopped']);
    lifetime.foreground(true);
    expect(changes).toEqual(['connected', 'stopped', 'connected']);
  });
});
