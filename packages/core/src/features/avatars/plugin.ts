import type { Context } from '@deepseek-ai/cordis';

import {
  PART_SLOTS,
  isAvatarAppearance,
  wornAvatarPart,
  type PartSlot,
} from '../../bots/avatar-appearance.js';
import { BOT_AVATAR_PATH, createBotAvatarHttp } from '../../bots/avatar-http.js';
import { BOT_BANNER_PATH, createBotBannerHttp } from '../../bots/banner-http.js';
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
  routes: () => {
    register(route: {
      path: string;
      methods: readonly ('GET' | 'POST')[];
      requestBody: 'buffered' | 'streaming';
      fetch(request: Request): Promise<Response>;
    }): () => Promise<void>;
  },
  registry: PersonaBotRegistry,
): void {
  const botBannerHttp = createBotBannerHttp(registry);
  ctx.effect(
    () =>
      routes().register({
        path: BOT_BANNER_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: botBannerHttp,
      }),
    'botharness: Bot banner',
  );
  const botAvatarHttp = createBotAvatarHttp(registry);
  ctx.effect(
    () =>
      routes().register({
        path: BOT_AVATAR_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: botAvatarHttp,
      }),
    'botharness: PersonaBot avatar',
  );
}
