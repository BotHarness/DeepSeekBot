import type { coalesce } from '../../core/src/runtime/coalesce.js';
import type { BrowserConfig } from './browser-config.js';
import type { createBorrowService } from './borrow.js';
import type { createDailyControl } from './daily.js';
import type { createBrowserDiagnostics } from './diagnostics.js';
import type { createProfileControl } from './profile-control.js';
import { toBrowserErrorBody } from './runtime/provision.js';
import { listStoredProfileNames, type createBotBrowserRuntimes } from './runtimes.js';
import type { createBrowserToolProvider } from './tool/provider.js';
import { localViewerUrl } from './viewer-local.js';

interface BrowserInteractionOptions {
  json(value: unknown, status?: number): Response;
  target(): NonNullable<BrowserConfig['target']>;
  diagnostics: ReturnType<typeof createBrowserDiagnostics>;
  runtimes: ReturnType<typeof createBotBrowserRuntimes>;
  provider: ReturnType<typeof createBrowserToolProvider>;
  switching(): Promise<void>;
  previewScope(slug: string): string;
  profile: ReturnType<typeof createProfileControl>;
  daily: ReturnType<typeof createDailyControl>;
  borrow: ReturnType<typeof createBorrowService>;
  profileDirectory(): string;
  observationChanged: Pick<ReturnType<typeof coalesce>, 'schedule'>;
}

export function createBrowserInteractionHandlers({
  json,
  target,
  diagnostics,
  runtimes,
  provider,
  switching,
  previewScope,
  profile,
  daily,
  borrow,
  profileDirectory,
  observationChanged,
}: BrowserInteractionOptions) {
  return {
    open: async (request: Request): Promise<Response> => {
      if (
        target() === 'extension' ||
        target() === 'daily-control' ||
        target() === 'profile-control'
      )
        return json(
          { ok: false, error: 'Connect a Daily Browser document in the Browser entry' },
          409,
        );
      let body: { slug?: unknown; tab?: unknown } = {};
      try {
        body = (await request.json()) as typeof body;
      } catch {
        void 0;
      }
      const slug = typeof body.slug === 'string' ? body.slug : '';
      if (slug === '') return json({ ok: false, error: 'slug is required' }, 400);
      diagnostics.record('lifecycle', `open requested (panel) slug=${slug}`);
      runtimes.touch(slug);
      provider.touch(slug);
      try {
        await switching();
        const scope = previewScope(slug);
        const requested = typeof body.tab === 'string' && body.tab !== '' ? body.tab : undefined;
        const tab = await provider.openForHuman(slug, requested);
        if (scope !== previewScope(slug))
          throw new Error('Browser authority changed while opening');
        const opened = runtimes.for(slug);
        return json({
          ok: true,
          tabId: tab.tabId,
          viewerUrl:
            opened.viewerUrl?.() ??
            (target() === 'local' && opened.isRunning() ? localViewerUrl(slug) : null),
        });
      } catch (error) {
        return json(toBrowserErrorBody(error), 500);
      }
    },
    observation: async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const slug = url.searchParams.get('slug') ?? '';
      try {
        await switching();
      } catch {
        return json({
          ok: true,
          target: target(),
          cleanupRequired: true,
          running: false,
          frame: null,
          focused: null,
          takeover: false,
          handoffPending: false,
          tabs: [],
        });
      }
      const scope = previewScope(slug);
      const requested = url.searchParams.get('tab') ?? '';
      if (target() === 'profile-control')
        return json({
          ok: true,
          target: 'profile-control',
          running: false,
          frame: null,
          focused: null,
          takeover: provider.isTakeover(slug),
          handoffPending: provider.takeoverPending(slug),
          tabs: [],
          profile: await profile.view(),
        });
      if (target() === 'daily-control')
        return json({
          ok: true,
          target: 'daily-control',
          running: false,
          frame: null,
          focused: null,
          takeover: provider.isTakeover(slug),
          handoffPending: provider.takeoverPending(slug),
          tabs: [],
          daily: daily.view(slug) ?? null,
        });
      if (target() === 'extension')
        return json({
          ok: true,
          target: 'extension',
          running: false,
          frame: null,
          focused: null,
          takeover: false,
          handoffPending: false,
          tabs: [],
          borrowed: borrow.view(slug) ?? null,
        });
      if (slug === '') {
        return json({
          ok: true,
          running: false,
          frame: null,
          focused: null,
          takeover: false,
          handoffPending: false,
          tabs: [],
        });
      }
      runtimes.touch(slug);
      provider.touch(slug);
      const runtime = runtimes.for(slug);
      const tabId =
        requested !== '' && provider.ownsTab(slug, requested)
          ? requested
          : provider.currentTab(slug);
      let frame: string | null = null;
      if (tabId !== undefined && runtime.isRunning()) {
        const shot = await runtime.captureScreenshot(tabId).catch(() => undefined);
        if (shot !== undefined) frame = `data:${shot.mimeType};base64,${shot.data}`;
      }
      const discoveryStarted = Date.now();
      const profiles = await listStoredProfileNames(profileDirectory()).catch(() => {
        diagnostics.record(
          'lifecycle',
          `initiator=observation phase=profile-discovery outcome=unavailable reason=directory-unavailable durationMs=${Date.now() - discoveryStarted}`,
        );
        return [];
      });
      const tabs = await provider.listTabs(slug);
      if (scope !== previewScope(slug))
        return json({ ok: false, error: 'Browser authority changed during observation' }, 409);
      return json({
        ok: true,
        running: runtime.isRunning(),
        frame,
        focused: tabId ?? null,
        takeover: provider.isTakeover(slug),
        handoffPending: provider.takeoverPending(slug),
        tabs,
        profiles,
        target: target(),
        viewerUrl:
          runtime.viewerUrl?.() ??
          (target() === 'local' && runtime.isRunning() && tabId !== undefined
            ? localViewerUrl(slug)
            : null),
        provisioning: runtimes.installProgress(slug) ?? null,
      });
    },
    takeover: async (request: Request): Promise<Response> => {
      if (target() === 'extension')
        return json({ ok: false, error: 'Daily Browser is read-only; use Return tab' }, 409);
      let body: { slug?: unknown; active?: unknown } = {};
      try {
        body = (await request.json()) as typeof body;
      } catch {
        void 0;
      }
      const slug = typeof body.slug === 'string' ? body.slug : '';
      if (slug === '' || typeof body.active !== 'boolean') {
        return json({ ok: false, error: 'slug and active are required' }, 400);
      }
      runtimes.touch(slug);
      provider.touch(slug);
      await switching();
      const takeover = provider.setTakeover(slug, body.active);
      if (target() === 'daily-control') {
        try {
          await daily.pause(slug, body.active);
        } catch (error) {
          daily.returnBot(slug);
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'Daily Browser control changed',
            },
            409,
          );
        }
      }
      if (target() === 'profile-control') {
        try {
          await profile.pause(slug, body.active);
        } catch {
          profile.returnBot(slug);
          return json(
            { ok: false, error: 'Chrome Profile disconnected; reconnect and observe again' },
            409,
          );
        }
      }
      observationChanged.schedule();
      return json({ ok: true, takeover });
    },
  };
}
