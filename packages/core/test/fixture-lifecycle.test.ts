import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createTestRosterStore } from './roster-fixture.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { cleanupTempRoots, createTempRoot } from './helpers.js';

describe('fixture database lifecycle', () => {
  it('closes a nested Registry owner before removing its parent root', () => {
    const root = createTempRoot('botharness-fixture-lifecycle-');
    const registryRoot = join(root, 'bots');
    createTestRegistry({ rootDir: registryRoot });
    const database = registryDatabase(registryRoot);
    expect(database.mode).toBe('ready');

    cleanupTempRoots();

    expect(database.mode).toBe('closed');
    expect(existsSync(root)).toBe(false);
  });

  it('closes a supplied owner shared by Registry and Roster before deleting its root', () => {
    const root = createTempRoot('botharness-fixture-lifecycle-');
    const database = mountOperationalDatabase({
      dshHome: root,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    createTestRegistry({ rootDir: join(root, 'bots'), database });
    createTestRosterStore({ database });

    cleanupTempRoots();

    expect(database.mode).toBe('closed');
    expect(existsSync(root)).toBe(false);
  });

  it('closes a supplied Roster owner without a Registry fixture', () => {
    const root = createTempRoot('botharness-fixture-lifecycle-');
    const database = mountOperationalDatabase({
      dshHome: root,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    createTestRosterStore({ database });

    cleanupTempRoots();

    expect(database.mode).toBe('closed');
    expect(existsSync(root)).toBe(false);
  });
});
