import { describe, expect, it } from 'vitest';
import { planNeedsHuman } from '../check-needs-human.mjs';

const internal = {
  association: 'MEMBER',
  permission: 'write',
  fork: false,
  labels: [],
  changes: [{ filename: 'packages/client/src/client/session-links.tsx' }],
  incomplete: false,
};

describe('needs-human merge policy', () => {
  it.each([
    ['CONTRIBUTOR', 'none'],
    ['MEMBER', 'read'],
    ['COLLABORATOR', 'read'],
    ['COLLABORATOR', 'none'],
  ])('holds a %s with %s access', (association, permission) => {
    expect(planNeedsHuman({ ...internal, association, permission })).toEqual({
      action: 'add',
      reasons: [
        { rule: 'Author lacks write access as an organization member or collaborator', paths: [] },
      ],
    });
  });

  it('holds a fork from an author with write access', () => {
    expect(planNeedsHuman({ ...internal, fork: true })).toEqual({
      action: 'add',
      reasons: [{ rule: 'Head repository is a fork', paths: [] }],
    });
  });

  it.each([
    ['Schema migrations', 'packages/connect-relay/migrations/0008_host_labels.sql'],
    ['Schema migrations', 'packages/core/src/database/schema-plan.ts'],
    ['Schema migrations', 'packages/host-client/src/local-store.ts'],
    ['Schema migrations', 'scripts/schema-migrations.json'],
    ['Release, store or deploy', '.github/workflows/npm-release.yml'],
    ['Release, store or deploy', '.github/workflows/npm-prerelease-prepare.yml'],
    ['Release, store or deploy', 'apps/mobile/eas.json'],
    ['Release, store or deploy', 'packages/connect-relay/scripts/deploy.sh'],
    ['Release, store or deploy', 'scripts/npm-provider-release.mjs'],
    ['Release, store or deploy', 'deploy/private-relay/compose.yaml'],
    ['Auth, secrets or permissions', 'packages/connect-relay/src/auth.ts'],
    ['Auth, secrets or permissions', 'packages/core/src/credentials/secret-mcp-store.ts'],
    ['Auth, secrets or permissions', 'packages/core/src/devices/relationship-enrollment.ts'],
    ['Installed-client protocol contracts', 'packages/host-protocol/src/wire.ts'],
    ['Installed-client protocol contracts', 'packages/core/src/team/channel-contract.ts'],
    ['Human merge guardrail', '.github/workflows/pr-needs-human.yml'],
  ])('holds %s changes in %s', (rule, filename) => {
    expect(planNeedsHuman({ ...internal, changes: [{ filename }] })).toEqual({
      action: 'add',
      reasons: [{ rule, paths: [filename] }],
    });
  });

  it('reports every triggering rule and detects paths renamed out of a protected area', () => {
    const previous = 'packages/core/src/database/schema.ts';
    const changes = [
      { filename: 'packages/core/src/database/sql.ts', previous_filename: previous },
      { filename: 'packages/core/src/database/schema-plan.ts' },
      { filename: previous },
      { filename: 'packages/host-protocol/src/wire.ts' },
    ];
    expect(planNeedsHuman({ ...internal, fork: true, changes })).toEqual({
      action: 'add',
      reasons: [
        { rule: 'Head repository is a fork', paths: [] },
        {
          rule: 'Schema migrations',
          paths: ['packages/core/src/database/schema-plan.ts', previous],
        },
        {
          rule: 'Installed-client protocol contracts',
          paths: ['packages/host-protocol/src/wire.ts'],
        },
      ],
    });
  });

  it('matches a protected directory even when a filename contains a newline', () => {
    const filename = 'packages/core/src/credentials/token\nstore.ts';
    expect(planNeedsHuman({ ...internal, changes: [{ filename }] })).toEqual({
      action: 'add',
      reasons: [{ rule: 'Auth, secrets or permissions', paths: [filename] }],
    });
  });

  it.each([
    ['MEMBER', 'write'],
    ['COLLABORATOR', 'maintain'],
    ['OWNER', 'admin'],
  ])('leaves an ordinary PR from a %s with %s access alone', (association, permission) => {
    expect(planNeedsHuman({ ...internal, association, permission })).toEqual({
      action: 'none',
      reasons: [],
    });
  });

  it('keeps an existing label after all triggers disappear', () => {
    expect(planNeedsHuman({ ...internal, labels: ['needs-human'] })).toEqual({
      action: 'keep',
      reasons: [],
    });
  });

  it('keeps an existing label and reports the current reasons', () => {
    expect(planNeedsHuman({ ...internal, fork: true, labels: ['needs-human'] })).toEqual({
      action: 'keep',
      reasons: [{ rule: 'Head repository is a fork', paths: [] }],
    });
  });

  it('holds the PR if GitHub provides only part of the diff', () => {
    expect(planNeedsHuman({ ...internal, incomplete: true })).toEqual({
      action: 'add',
      reasons: [{ rule: 'GitHub did not provide the complete diff', paths: [] }],
    });
  });
});
