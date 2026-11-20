import { DesktopViewError, parseDesktopInput, type createDesktopView } from './desktop-view.js';
import type { createComputerDiagnostics } from './diagnostics.js';
import type { ComputerTarget, createComputerTargetRuntime } from './target.js';
import type { createComputerToolProvider } from './tool/provider.js';

const TAKEOVER_DRAIN_MS = 10_000;

interface DesktopOptions {
  json(value: unknown, status?: number): Response;
  migratedLocal(): boolean;
  legacyLocalRefusal(): Response;
  desktopView: ReturnType<typeof createDesktopView>;
  activity: { touch(): void };
  target(): ComputerTarget;
  parseBody(request: Request): Promise<Record<string, unknown>>;
  runtime: Pick<ReturnType<typeof createComputerTargetRuntime>, 'isRunning'>;
  toolProvider: Pick<ReturnType<typeof createComputerToolProvider>, 'drain'>;
  diagnostics: ReturnType<typeof createComputerDiagnostics>;
}

export function createDesktopHandlers({
  json,
  migratedLocal,
  legacyLocalRefusal,
  desktopView,
  activity,
  target,
  parseBody,
  runtime,
  toolProvider,
  diagnostics,
}: DesktopOptions) {
  const desktopRefusal = (error: unknown): Response => {
    if (error instanceof DesktopViewError)
      return json(
        { ok: false, code: error.code, error: error.message },
        error.code === 'not-running' || error.code === 'not-paused' ? 409 : 502,
      );
    return json({ ok: false, code: 'capture-failed', error: String(error) }, 502);
  };

  return {
    frame: async (request: Request): Promise<Response> => {
      if (migratedLocal()) return legacyLocalRefusal();
      const raw = new URL(request.url).searchParams.get('after');
      const after = raw === null || raw === '' ? undefined : Number(raw);
      if (after !== undefined && !Number.isSafeInteger(after))
        return json({ ok: false, code: 'invalid-after', error: 'after must be an integer' }, 400);
      try {
        const frame = await desktopView.next(after, request.signal);
        if (frame === undefined) return new Response(null, { status: 204 });
        activity.touch();
        return json({ ok: true, target: target(), paused: desktopView.isPaused(), ...frame });
      } catch (error) {
        return desktopRefusal(error);
      }
    },
    takeover: async (request: Request): Promise<Response> => {
      if (migratedLocal()) return legacyLocalRefusal();
      const body = await parseBody(request);
      if (typeof body['active'] !== 'boolean')
        return json({ ok: false, code: 'invalid-input', error: 'active must be a boolean' }, 400);
      if (body['active'] && !runtime.isRunning())
        return json({ ok: false, code: 'not-running', error: 'The Computer is not running.' }, 409);
      const paused = desktopView.setPaused(body['active']);
      if (paused) await toolProvider.drain(TAKEOVER_DRAIN_MS);
      activity.touch();
      diagnostics.record('computer-action', `viewer takeover ${paused ? 'on' : 'off'}`);
      return json({ ok: true, paused });
    },
    input: async (request: Request): Promise<Response> => {
      if (migratedLocal()) return legacyLocalRefusal();
      const input = parseDesktopInput(await parseBody(request));
      if (input === undefined)
        return json(
          {
            ok: false,
            code: 'invalid-input',
            error: 'input must be a click, scroll, type or key action',
          },
          400,
        );
      diagnostics.record(
        'computer-action',
        `viewer input kind=${input.kind}${input.kind === 'type' ? ` chars=${String(input.text.length)}` : ''}`,
      );
      try {
        await desktopView.input(input, request.signal);
        activity.touch();
        return json({ ok: true });
      } catch (error) {
        return desktopRefusal(error);
      }
    },
  };
}
