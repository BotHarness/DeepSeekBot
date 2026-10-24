import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../src/ui/product-name', async () => import('../src/ui/product-name.ios'));
import { interfacePreferences } from '../src/ui/interface-preferences';
import { t } from '../src/ui/strings';

afterEach(() => interfacePreferences.setLanguage('system'));

it.each([
  ['en', 'Tobs'],
  ['zh', '托布'],
] as const)(
  'uses the iOS brand after switching to %s without renaming compatibility keys',
  (language, name) => {
    interfacePreferences.setLanguage(language);
    expect(t.roster).toBe(name);
    expect(t.pairAccount.title).toContain(name);
    expect(t.pairAccount.deleteTitle).toContain(name);
    expect(t.appIconDeepSeekBot).toBe(name);
    expect(t.appIconDeepSeekBotSimple).toContain(name);
    expect(t.pairHint).toContain(name);
    expect(t.dictationDenied).toContain(name);
    expect(t.notificationsDenied).toContain(name);
  },
);
