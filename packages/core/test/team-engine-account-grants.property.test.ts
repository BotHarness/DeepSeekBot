import fc from 'fast-check';
import { it, expect } from 'vitest';
import { allowsEngineAccount, type ModelsAllowed } from '../src/team/permissions.js';

it('requires membership of the exact account ID regardless of API model scope', () => {
  fc.assert(
    fc.property(
      fc.array(fc.string({ minLength: 1 }), { maxLength: 20 }),
      fc.string({ minLength: 1 }),
      fc.boolean(),
      (engineAccounts, id, all) => {
        const allowed: ModelsAllowed = all
          ? { all: true, engineAccounts }
          : { all: false, providers: [id], routes: [`${id}/model`], engineAccounts };
        expect(allowsEngineAccount(allowed, id)).toBe(engineAccounts.includes(id));
        expect(allowsEngineAccount({ all: true }, id)).toBe(true);
      },
    ),
  );
});
