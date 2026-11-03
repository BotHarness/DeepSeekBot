import { describe, expect, it } from 'vitest';
import { createConnectionLifetime } from '../src/host/connection-lifetime';

describe('paired connection lifetime', () => {
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
