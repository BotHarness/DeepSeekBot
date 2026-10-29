import { createTestRegistry } from './registry-fixture.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createMemoryService } from '../src/index.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { handleCompactionEvent, refreshSessionTexts } from '../src/plugin.js';
import { createTestOwnership, FIXED_NOW, createTempRoot } from './helpers.js';

function setup() {
  const root = createTempRoot();
  const registry = createTestRegistry({
    rootDir: join(root, 'bots'),
    initializeMemory(memoryDir: string) {
      const repository = ensureMemoryRepository({ memoryDir });
      return repository.ok ? { ok: true } : { ok: false, message: repository.code };
    },
  });
  const ownership = createTestOwnership();
  const created = registry.create({ slug: 'ada', displayName: 'Ada' });
  expect(created.ok).toBe(true);
  ownership.claim({
    sessionId: 'session-ada',
    botSlug: 'ada',
    rootRole: 'orchestrator',
    at: FIXED_NOW().toISOString(),
  });
  const memoryDir = registry.memoryDirFor('ada');
  if (memoryDir === undefined) throw new Error('memory dir missing');
  const service = createMemoryService({ registry, ownership, now: FIXED_NOW });
  return { registry, ownership, service, memoryDir };
}

describe('handleCompactionEvent', () => {
  it('refreshes a diverged persona on compaction/end for an owned Session', () => {
    const { ownership, service, memoryDir } = setup();
    const warnings: string[] = [];
    const sink = {
      ownership,
      memory: service,
      warn: (message: string) => void warnings.push(message),
    };
    writeFileSync(join(memoryDir, 'SOUL.md'), '# Persona v1\n');
    expect(service.personaForSession('session-ada')).toContain('# Persona v1');

    writeFileSync(join(memoryDir, 'SOUL.md'), '# Persona v2\n');
    handleCompactionEvent(sink, 'session-ada', 'compaction/end');
    expect(service.personaForSession('session-ada')).toContain('# Persona v2');
    expect(warnings).toEqual([]);
  });

  it('leaves identical snapshots alone', () => {
    const { ownership, service, memoryDir } = setup();
    const warnings: string[] = [];
    writeFileSync(join(memoryDir, 'SOUL.md'), '# Persona v1\n');
    expect(service.personaForSession('session-ada')).toContain('# Persona v1');
    const before = ownership.personaSnapshot('session-ada');

    handleCompactionEvent(
      { ownership, memory: service, warn: (message: string) => void warnings.push(message) },
      'session-ada',
      'compaction/end',
    );
    expect(ownership.personaSnapshot('session-ada')).toEqual(before);
    expect(warnings).toEqual([]);
  });

  it('ignores unowned Sessions and foreign event types', () => {
    const { ownership, service, memoryDir } = setup();
    const warnings: string[] = [];
    const sink = {
      ownership,
      memory: service,
      warn: (message: string) => void warnings.push(message),
    };
    writeFileSync(join(memoryDir, 'SOUL.md'), '# Persona v1\n');
    expect(service.personaForSession('session-ada')).toContain('# Persona v1');

    handleCompactionEvent(sink, 'ghost-session', 'compaction/end');
    handleCompactionEvent(sink, 'session-ada', 'turn/end');
    handleCompactionEvent(sink, 'session-ada', 'compaction/start');
    expect(service.personaForSession('session-ada')).toContain('# Persona v1');
    expect(warnings).toEqual([]);
  });

  it('warns instead of throwing when the refresh fails', () => {
    const { ownership } = setup();
    const warnings: string[] = [];
    handleCompactionEvent(
      {
        ownership,
        memory: {
          refreshPersonaAfterCompaction: () => {
            throw new Error('boom');
          },
        },
        warn: (message: string) => void warnings.push(message),
      },
      'session-ada',
      'compaction/end',
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('persona refresh after compaction failed');
  });

  it('applies a pending persona without a compaction when refreshed directly', () => {
    const { ownership, service, memoryDir } = setup();
    writeFileSync(join(memoryDir, 'SOUL.md'), '# Persona v1\n');
    expect(service.personaForSession('session-ada')).toContain('# Persona v1');
    writeFileSync(join(memoryDir, 'SOUL.md'), '# Persona v2\n');
    expect(service.personaPending?.('session-ada')).toBe(true);

    refreshSessionTexts({ ownership, memory: service, warn: () => undefined }, 'session-ada');
    expect(service.personaPending?.('session-ada')).toBe(false);
    expect(service.personaForSession('session-ada')).toContain('# Persona v2');
  });
});
