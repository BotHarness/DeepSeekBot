import {
  BOT_ZIP_EXPORT_PATH,
  BOT_ZIP_FILES_PATH,
  BOT_ZIP_IMPORT_PATH,
} from '../../bots/bot-zip-http.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';

import { createBotZipHttp, type BotZipHttpDeps } from '../../bots/bot-zip-http.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ConnectAccount } from '../../devices/connect-account.js';
import { createMarketplaceClient } from '../../marketplace/client.js';
import { createInstallReceipts } from '../../marketplace/install-receipts.js';
import {
  createMarketplaceInstallReviews,
  INSTALL_REVIEW_SYSTEM_PROMPT,
  INSTALL_REVIEW_TIMEOUT_MS,
} from '../../marketplace/install-review.js';
import { createShareDrafts } from '../../marketplace/share-draft.js';
import { createMarketplaceUploads } from '../../marketplace/uploaded-bots.js';
import type { ModelCatalog } from '../../models/catalog.js';
import type { TobService } from '../../tob/service.js';
import {
  APPROVAL_REVIEW_SESSION_PREFIX,
  ApprovalReviewError,
  type ApprovalReviewerRoute,
  routeLabel,
  runReviewerTurn,
} from '../../workspaces/approval-reviewer.js';

export function apply(
  ctx: Context,
  {
    baseUrl,
    dshHome,
    registry,
    account,
  }: {
    baseUrl: string;
    dshHome: string;
    registry: Pick<PersonaBotRegistry, 'get' | 'memoryDirFor'>;
    account: () => ConnectAccount | undefined;
  },
) {
  const marketplaceClient = createMarketplaceClient({
    baseUrl,
  });
  const shareDrafts = createShareDrafts({
    root: join(dshHome, 'botharness', 'share-drafts'),
    memoryDir: (slug) =>
      registry.get(slug) === undefined ? undefined : registry.memoryDirFor(slug),
    log: (event) => ctx.logger.info(JSON.stringify(event)),
  });
  const marketplaceUploads = createMarketplaceUploads({
    client: marketplaceClient,
    account,
    drafts: shareDrafts,
    log: (event) => ctx.logger.info(JSON.stringify(event)),
  });
  return { marketplaceClient, marketplaceUploads, shareDrafts };
}

export function createInstallReviews(
  ctx: Context,
  {
    dshHome,
    registry,
    tob,
    defaultRoute,
    modelCatalog,
    reviewing,
    marketplaceUploads,
  }: {
    dshHome: string;
    registry: Pick<PersonaBotRegistry, 'get'>;
    tob: Pick<TobService, 'slug'>;
    defaultRoute: () => ApprovalReviewerRoute;
    modelCatalog: Pick<ModelCatalog, 'validate'>;
    reviewing: Set<string>;
    marketplaceUploads: ReturnType<typeof createMarketplaceUploads>;
  },
) {
  return createMarketplaceInstallReviews({
    uploads: marketplaceUploads,
    reviewer: async (prompt, botName) => {
      const tobSlug = tob.slug();
      let route: ApprovalReviewerRoute | undefined =
        tobSlug === undefined ? undefined : registry.get(tobSlug)?.modelPlan?.orchestrator;
      if (route === undefined) {
        try {
          route = defaultRoute();
        } catch {
          route = undefined;
        }
      }
      if (route === undefined) throw new ApprovalReviewError('no-model');
      try {
        await modelCatalog.validate(route);
      } catch (error) {
        throw new ApprovalReviewError(
          'model-unavailable',
          error instanceof Error ? error.message : String(error),
        );
      }
      const sessionId = APPROVAL_REVIEW_SESSION_PREFIX + 'install-' + randomUUID();
      const cwd = join(dshHome, 'botharness', 'approval-reviews');
      mkdirSync(cwd, { recursive: true });
      const titles = ctx.get('sessionTitle') as
        | { rename?: (session: unknown, title: string) => void }
        | undefined;
      reviewing.add(sessionId);
      try {
        const text = await runReviewerTurn(
          ctx.agents,
          route,
          {
            systemPrompt: INSTALL_REVIEW_SYSTEM_PROMPT,
            sectionName: 'botharness:install-review',
            prompt,
            title: `Install review · ${botName}`,
            signal: new AbortController().signal,
            maxTokens: 4_000,
          },
          {
            sessionId,
            cwd,
            timeoutMs: INSTALL_REVIEW_TIMEOUT_MS,
            ...(typeof titles?.rename === 'function'
              ? { rename: (session, title) => titles.rename!(session, title) }
              : {}),
          },
        );
        return { text, model: routeLabel(route) };
      } finally {
        reviewing.delete(sessionId);
      }
    },
  });
}

export function createReceipts(
  ctx: Context,
  marketplaceClient: ReturnType<typeof createMarketplaceClient>,
  telemetryDir: string,
) {
  return createInstallReceipts({
    client: marketplaceClient,
    dataDir: telemetryDir,
    log: (event) => ctx.logger.info(JSON.stringify(event)),
  });
}

export function createZipTransfer(ctx: Context, deps: Pick<BotZipHttpDeps, 'registry' | 'detail'>) {
  return createBotZipHttp({
    ...deps,
    log: (message) => ctx.logger.info(message),
  });
}

export function mountZipRoutes(
  ctx: Context,
  routes: () => {
    register(route: {
      path: string;
      methods: readonly ('GET' | 'POST')[];
      requestBody: 'buffered' | 'streaming';
      fetch(request: Request): Promise<Response>;
    }): () => Promise<void>;
  },
  fetch: ReturnType<typeof createBotZipHttp>,
): void {
  ctx.effect(
    () =>
      routes().register({
        path: BOT_ZIP_EXPORT_PATH,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch,
      }),
    'botharness: Bot Zip export',
  );
  ctx.effect(
    () =>
      routes().register({
        path: BOT_ZIP_FILES_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch,
      }),
    'botharness: Bot Zip file list',
  );
  ctx.effect(
    () =>
      routes().register({
        path: BOT_ZIP_IMPORT_PATH,
        methods: ['POST'],
        requestBody: 'streaming',
        fetch,
      }),
    'botharness: Bot Zip import',
  );
}
