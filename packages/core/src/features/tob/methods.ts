import {
  asObject,
  asSlug,
  invalidInput,
  unavailable,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { TeamError } from '../../team/error.js';
import { BotNetworkDeliveryError } from '../../runtime/bot-network.js';
import { TobError, type TobHome } from '../../tob/service.js';
import { tobCliRequestSchema, type TobCliStatus } from '../../tob/cli-request.js';
import { DirectBotToolError } from '../../runtime/bot-runtime.js';
import { GenuiDiagramError } from '../../runtime/genui-diagram.js';
import { GenuiPreviewError } from '../../runtime/genui-preview.js';
import { ChannelCallReadError } from '../../channels/call-window.js';
import type { DirectBotToolSpec } from '../../runtime/bot-runtime.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import type { HumanContext } from '../../humans/context.js';

const DIRECT_TOOL_TIMEOUT_MS = 10 * 60_000;

function directToolsUnavailable(): BridgeResult<never> {
  return {
    ok: false,
    error: {
      code: 'unavailable',
      message: 'Direct Bot tools are unavailable on this Host',
    },
  };
}

export interface TobAdapterMethods {
  tobHome(
    payload: unknown,
  ): Promise<
    BridgeResult<
      (TobHome & { attention?: { unreadCount: number; hasAction: boolean } }) | { available: false }
    >
  >;
  tobCli(payload: unknown): Promise<BridgeResult<TobCliStatus>>;
  botTools(payload: unknown): BridgeResult<{ sessionId: 'direct'; tools: DirectBotToolSpec[] }>;
  botToolRun(payload: unknown): Promise<
    BridgeResult<{
      slug: string;
      tool: string;
      sessionId: 'direct';
      result: unknown;
    }>
  >;
}

export function createTobAdapterMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  isHostOwner: () => boolean,
): TobAdapterMethods {
  return {
    async tobCli(payload) {
      if (!isHostOwner())
        return {
          ok: false,
          error: { code: 'permission-required', message: 'Host owner authentication is required.' },
        };
      const parsed = tobCliRequestSchema.safeParse(payload);
      if (!parsed.success) return invalidInput('Invalid bounded Tob CLI request');
      if (!deps.runtime?.tobCli) return unavailable();
      try {
        return { ok: true, value: await deps.runtime.tobCli(human, parsed.data) };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof TobError ? error.code : 'operation-failed',
            message:
              error instanceof TobError ? error.code : 'The Tob CLI request could not complete.',
          },
        };
      }
    },
    async tobHome() {
      if (!isHostOwner()) return { ok: true, value: { available: false as const } };
      if (!deps.tob) return unavailable();
      try {
        const home = await deps.tob.ensure(human);
        const attention = deps.humanAttention?.status(human);
        return {
          ok: true,
          value: { ...home, ...(attention ? { attention } : {}) },
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof Error ? error.message : 'tob-unavailable',
            message: error instanceof Error ? error.message : 'Tob unavailable',
          },
        };
      }
    },
    botTools() {
      const tools = deps.runtime?.directBotTools?.();
      if (tools === undefined) return directToolsUnavailable();
      return { ok: true, value: { sessionId: 'direct', tools } };
    },
    async botToolRun(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const source = asObject(payload);
      const tool = source['tool'];
      if (typeof tool !== 'string' || tool.trim() === '') return invalidInput('tool is required');
      const args = source['args'] ?? {};
      if (typeof args !== 'object' || args === null || Array.isArray(args))
        return invalidInput('args must be an object of tool arguments');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      const session = source['sessionId'];
      if (session !== undefined && (typeof session !== 'string' || session.trim() === ''))
        return invalidInput('sessionId must be a Session id');
      if (deps.runtime?.runDirectBotTool === undefined) return directToolsUnavailable();
      const sourceEventId = source['sourceEventId'];
      if (
        sourceEventId !== undefined &&
        (typeof sourceEventId !== 'string' ||
          sourceEventId.length === 0 ||
          sourceEventId.length > 128)
      )
        return invalidInput('sourceEventId must identify an admitted Source Event');
      try {
        const run = await deps.runtime.runDirectBotTool(
          slug,
          tool.trim(),
          args as Record<string, unknown>,
          AbortSignal.timeout(DIRECT_TOOL_TIMEOUT_MS),
          session?.trim(),
          sourceEventId,
          human,
        );
        return { ok: true, value: { slug, ...run } };
      } catch (error) {
        return {
          ok: false,
          error: {
            code:
              error instanceof TeamError ||
              error instanceof DirectBotToolError ||
              error instanceof ChannelCallReadError ||
              error instanceof TobError ||
              error instanceof BotNetworkDeliveryError ||
              error instanceof GenuiPreviewError ||
              error instanceof GenuiDiagramError
                ? error.code
                : 'tool-failed',
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof TeamError && error.details ? { details: error.details } : {}),
          },
        };
      }
    },
  };
}
