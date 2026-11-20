import { Appearance } from '../src/client/appearance.js';
import { mountAppearance } from '../src/client/appearance-scope.js';
import { bindBotAppearance } from '../src/client/bot-color-scheme.js';

export function mountAppearanceFixture() {
  let saved: string | null = null;
  const owner = new Appearance(
    {
      getItem: () => saved,
      setItem: (_key, value) => {
        saved = value;
      },
    },
    () => 'light',
  );
  const unbind = bindBotAppearance(owner);
  const unmount = mountAppearance(owner);
  return {
    owner,
    dispose: () => {
      unmount();
      unbind();
    },
  };
}
