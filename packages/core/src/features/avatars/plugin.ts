import type { Context } from '@deepseek-ai/cordis';

import { BOT_AVATAR_PATH, createBotAvatarHttp } from '../../bots/avatar-http.js';
import { BOT_BANNER_PATH, createBotBannerHttp } from '../../bots/banner-http.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';

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
