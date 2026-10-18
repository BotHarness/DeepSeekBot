import { describe, expect, it } from 'vitest';
import { checkUiInventory, uiSurfacesFrom } from '../cli-ui-inventory.mjs';

const client = 'packages/client/src/client/preferences.tsx';
const group = (surfaces, extra = {}) => ({
  id: 'appearance',
  scope: 'Client',
  description: 'User theme preference',
  issue: '#2095',
  surfaces,
  ...extra,
});

describe('UI and CLI coverage inventory', () => {
  it('uses the same Client inventory keys on Windows and POSIX', () => {
    const source = `storage.setItem('theme', value); const ui = <SettingsRow title="Theme" />;`;
    const expected = uiSurfacesFrom(client, source);
    expect(expected).toHaveLength(2);
    expect(uiSurfacesFrom(client.replaceAll('/', '\\'), source)).toEqual(expected);
  });
  it('uses the same inventory keys and Client detection for Windows paths', () => {
    const source = `storage.setItem('theme', value); const ui = <SettingsRow title={t('theme')} />;`;
    expect(uiSurfacesFrom(client.replaceAll('/', '\\'), source)).toEqual(
      uiSurfacesFrom(client, source),
    );
  });

  it('detects new local settings in an already reviewed Client file', () => {
    const old = uiSurfacesFrom(client, `storage?.setItem('theme', value);`);
    const next = uiSurfacesFrom(
      client,
      `storage?.setItem('theme', value); storage.setItem(key, value);`,
    );
    const errors = checkUiInventory(next, { groups: [group(old)] }, '');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('setItem(key)');
  });

  it('also finds local services in sibling package Clients', () => {
    expect(
      uiSurfacesFrom(
        'packages/computer/src/client/index.tsx',
        `sessionStorage.setItem(CONSENT_KEY, '1');`,
      ),
    ).toHaveLength(1);
  });

  it('discovers shared settings controls and native fields without persistence literals', () => {
    const surfaces = uiSurfacesFrom(
      client,
      `
      const MOTION_FIELD = 'motion';
      const ui = <SettingsRow title={t('theme')} control={<Toggle />} />;
    `,
    );
    expect(surfaces).toEqual([`field:${client}:motion`, `setting:${client}:{t('theme')}`]);
    expect(checkUiInventory(surfaces, { groups: [] }, '')).toHaveLength(2);
  });

  it('covers scoped control adapters and native fields outside the Client package', () => {
    expect(
      uiSurfacesFrom(
        'packages/browser/src/client/settings.tsx',
        '<ConfigChoice scope={scope} field="target" />;',
      ),
    ).toEqual(['field-control:packages/browser/src/client/settings.tsx:"target"']);
    expect(
      uiSurfacesFrom('packages/computer/src/settings.ts', `export const TARGET_FIELD = 'target';`),
    ).toEqual(['field:packages/computer/src/settings.ts:target']);
  });

  it('tracks constants, templates, shorthand paths, prefix routes and helper routes', () => {
    const host = 'packages/core/src/http.ts';
    const surfaces = uiSurfacesFrom(
      host,
      `
      connection.fetch.register({ path: IMPORT_PATH, methods: ['POST'] });
      for (const suffix of ['/read', '/write']) {
        connection.fetch.register({ path: BASE + suffix, methods: ['POST'] });
      }
      connection.fetch.register({ path, requestBody: 'buffered' });
      server.register({ path: PREFIX, handler });
      route('/api/todos/add', 'POST', handler);
    `,
    );
    expect(surfaces).toContain(`route:${host}:IMPORT_PATH`);
    expect(surfaces).toContain(`route:${host}:BASE + suffix in ['/read', '/write']`);
    expect(surfaces).toContain(`route:${host}:path`);
    expect(surfaces).toContain(`route:${host}:PREFIX`);
    expect(surfaces).toContain(`route:${host}:'/api/todos/add' POST`);
  });

  it('requires review when a computed route family grows', () => {
    const source = (actions) =>
      'for (const action of ' +
      actions +
      ') ' +
      'register({ path: `/api/browser/${action}`, methods: ["POST"] });';
    const file = 'packages/browser/src/index.ts';
    const before = uiSurfacesFrom(file, source('["pair"]'));
    const after = uiSurfacesFrom(file, source('["pair", "forget"]'));
    const errors = checkUiInventory(after, { groups: [group(before)] }, '');
    expect(errors.some((error) => error.includes('missing'))).toBe(true);
    expect(errors.some((error) => error.includes('stale'))).toBe(true);
  });

  it('ignores comments, schema path properties and example strings', () => {
    expect(
      uiSurfacesFrom(
        client,
        `
      // localStorage.setItem('fake', value)
      const example = "storage.setItem('fake', value)";
      const descriptor = { path: '/api/not-a-route', description: 'text' };
    `,
      ),
    ).toEqual([]);
  });

  it('rejects duplicate mappings, retired commands and configurable exemptions', () => {
    const surfaces = ['setting:theme'];
    const inventory = {
      groups: [
        group(surfaces, { issue: undefined, commands: ['removed'] }),
        group(surfaces, { issue: undefined, exemption: 'UI only' }),
      ],
    };
    const errors = checkUiInventory(surfaces, inventory, "'settings-set'");
    expect(errors.some((error) => error.includes('missing command removed'))).toBe(true);
    expect(errors.some((error) => error.includes('duplicates'))).toBe(true);
    expect(errors.some((error) => error.includes('nonconfigurable'))).toBe(true);
  });

  it('allows documented transient UI exemptions and specific tracked gaps', () => {
    expect(
      checkUiInventory(
        ['draft', 'layout'],
        {
          groups: [
            group(['draft'], {
              issue: undefined,
              exemption: 'Submission recovery receipt',
              configurable: false,
            }),
            group(['layout'], { issue: '#2096' }),
          ],
        },
        '',
      ),
    ).toEqual([]);
  });
});
