import type { Context } from '@deepseek-ai/cordis';

import {
  PART_SLOTS,
  isAvatarAppearance,
  wornAvatarPart,
  type PartSlot,
} from '../../bots/avatar-appearance.js';
import { createBotAvatarHttp } from '../../bots/avatar-http.js';
import { createBotBannerHttp } from '../../bots/banner-http.js';
import { createPartLibrary } from '../../bots/part-library.js';
import type { PersonaBotRegistry, PersonaBotRegistryOptions } from '../../bots/registry.js';
import { attachOperationalModule, type OperationalDatabaseOwner } from '../../database/owner.js';

export function apply(operationalDatabase: OperationalDatabaseOwner) {
  const partLibrary = createPartLibrary({
    database: attachOperationalModule(operationalDatabase, 'avatar-part-library'),
  });
  const onAppearanceImported: NonNullable<PersonaBotRegistryOptions['onAppearanceImported']> = (
    record,
  ) => {
    const recipe = isAvatarAppearance(record.appearance) ? record.appearance.recipe : undefined;
    if (recipe?.family !== 'illustrated') return;
    for (const slot of Object.keys(PART_SLOTS) as PartSlot[]) {
      const part = wornAvatarPart(recipe, slot);
      if (part)
        partLibrary.add({
          part,
          name: '',
          origin: 'imported-bot',
          author: record.displayName,
        });
    }
  };
  return { partLibrary, onAppearanceImported };
}

export function mountRoutes(
  ctx: Context,
  {
    registry,
    registerBanner,
    registerAvatar,
  }: {
    registry: PersonaBotRegistry;
    registerBanner: (fetch: ReturnType<typeof createBotBannerHttp>) => () => Promise<void>;
    registerAvatar: (fetch: ReturnType<typeof createBotAvatarHttp>) => () => Promise<void>;
  },
): void {
  const botBannerHttp = createBotBannerHttp(registry);
  ctx.effect(() => registerBanner(botBannerHttp), 'botharness: Bot banner');
  const botAvatarHttp = createBotAvatarHttp(registry);
  ctx.effect(() => registerAvatar(botAvatarHttp), 'botharness: PersonaBot avatar');
}
