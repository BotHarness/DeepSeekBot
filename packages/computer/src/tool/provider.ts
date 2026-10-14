import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-computer-use';
import { ComputerUseProviderName } from '@deepseek-ai/dsh-computer-use/brand';
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-user-approval';

import { COMPUTER_GUIDANCE, COMPUTER_TOOLS, FALLBACK_TOOLS, computerToolName } from './catalog.js';
import type { CuaDriver, DriverToolDescriptor } from './driver.js';

function modelVisibleDriverResult(result: unknown): unknown {
  if (
    typeof result !== 'object' ||
    result === null ||
    !('structuredContent' in result) ||
    result.structuredContent === undefined ||
    !('content' in result) ||
    !Array.isArray(result.content)
  )
    return result;
  return {
    ...result,
    content: [
      ...result.content,
      { type: 'text', text: JSON.stringify({ structuredContent: result.structuredContent }) },
    ],
  };
}

export const COMPUTER_PROVIDER_NAME = 'botharness-computer';

export const COMPUTER_PROMPT_SECTION = 'botharness:computer';

export interface ComputerAuditEvent {
  readonly at: string;
  readonly botSlug: string;
  readonly sessionId: string;
  readonly rootRole: string;
  readonly tool: string;
  readonly summary: string;
  readonly outcome: 'ok' | 'error';
  readonly durationMs: number;
  readonly error?: string;
}

export interface ComputerCoreLookup {
  readonly registry:
    | {
        get(slug: string): { computerAccess?: boolean } | undefined;
        list(): readonly { slug: string; computerAccess?: boolean }[];
      }
    | undefined;
  readonly ownership:
    | { resolve(sessionId: string): { botSlug: string; rootRole: string } | undefined }
    | undefined;
  readonly contributeBotAgentSetup?:
    | ((
        contribute: (
          agentCtx: Context,
          agent: Agent,
          info: { botSlug: string; rootRole: string },
        ) => void,
      ) => () => void)
    | undefined;
}

export interface ComputerToolProviderOptions {
  readonly ctx: Context;
  readonly driver: CuaDriver;
  readonly isComputerRunning: () => boolean;
  readonly isAutoAllowed: () => boolean;
  readonly guidance?: (() => string) | undefined;
  readonly authorizationScope?: (() => string) | undefined;
  readonly audit: (event: ComputerAuditEvent) => void;
  readonly note?: (detail: string) => void;
  readonly onActivity?: () => void;
  readonly core: () => ComputerCoreLookup;
}

export function computerToolNames(): readonly string[] {
  return COMPUTER_TOOLS.map((spec) => computerToolName(spec.raw));
}

export function ownsComputerTool(name: string): boolean {
  return COMPUTER_TOOLS.some((spec) => computerToolName(spec.raw) === name);
}

export interface ComputerToolProvider {
  attachAgent(scope: Context, sessionId: string, info: { botSlug: string; rootRole: string }): void;
  needsAuthorization(sessionId: string): boolean;
  markAuthorized(sessionId: string, scope?: string): boolean;
  reconcileBot(slug: string): Promise<void>;
  reconcileAll(): Promise<void>;
  resetRuntime(): void;
  directTools(): Promise<readonly { name: string; description: string; inputSchema: unknown }[]>;
  runDirect(
    slug: string,
    tool: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown>;
  dispose(): Promise<void>;
}

interface SessionRegistration {
  readonly slug: string;
  readonly scope: Context;
  readonly disposers: readonly (() => void)[];
  readonly source: 'driver' | 'fallback';
}

export function selectCuratedTools(
  descriptors: readonly DriverToolDescriptor[],
): readonly { raw: string; descriptor: DriverToolDescriptor }[] {
  const byName = new Map(descriptors.map((descriptor) => [descriptor.name, descriptor]));
  return COMPUTER_TOOLS.flatMap((spec) => {
    const descriptor = byName.get(spec.raw);
    return descriptor === undefined ? [] : [{ raw: spec.raw, descriptor }];
  });
}

export function auditSummary(raw: string, args: Record<string, unknown>): string {
  const spec = COMPUTER_TOOLS.find((candidate) => candidate.raw === raw);
  if (spec === undefined) return 'tool';
  try {
    return spec.audit(args);
  } catch {
    return 'tool';
  }
}

export function formatAudit(event: ComputerAuditEvent): string {
  const outcome = event.outcome === 'ok' ? 'ok' : `error: ${event.error ?? 'failed'}`;
  return `bot=${event.botSlug} session=${event.sessionId} role=${event.rootRole} ${event.tool} ${event.summary} -> ${outcome} (${event.durationMs}ms)`;
}

export function createComputerToolProvider(
  options: ComputerToolProviderOptions,
): ComputerToolProvider {
  const { ctx, driver, isComputerRunning, isAutoAllowed, audit, core } = options;
  const note = options.note ?? ((): void => undefined);
  const onActivity = options.onActivity ?? ((): void => undefined);

  const sessions = new Map<string, { scope: Context; disposed: boolean }>();
  const registrations = new Map<string, SessionRegistration>();
  const grants = new Map<string, string>();
  const authorizationScope = (): string => options.authorizationScope?.() ?? 'computer';
  const granted = (sessionId: string): boolean => grants.get(sessionId) === authorizationScope();
  let slotDisposer: (() => Promise<void>) | undefined;
  let disposed = false;

  const botSlugOf = (sessionId: string): { botSlug: string; rootRole: string } | undefined =>
    core().ownership?.resolve(sessionId);

  let cachedTools: readonly DriverToolDescriptor[] | undefined;
  let warming: Promise<void> | undefined;
  let catalogEpoch = 0;

  const warmCatalog = (): void => {
    if (warming !== undefined || disposed || !isComputerRunning()) return;
    const epoch = catalogEpoch;
    warming = (async () => {
      try {
        await driver.ensure();
        const descriptors = await driver.tools();
        if (disposed || epoch !== catalogEpoch) return;
        cachedTools = descriptors;
        for (const [sessionId, registration] of [...registrations]) {
          if (registration.source !== 'fallback') continue;
          if (core().registry?.get(registration.slug)?.computerAccess !== true) continue;
          registerSession(sessionId, registration.scope, registration.slug);
        }
      } catch (error) {
        note(
          `driver warm failed: ${error instanceof Error ? error.message : String(error)}`.slice(
            0,
            160,
          ),
        );
        ctx.logger.warn(
          `botharness-computer: driver unavailable, keeping fallback tools: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        warming = undefined;
      }
    })();
  };

  const registerSession = (sessionId: string, scope: Context, slug: string): void => {
    if (disposed) return;
    const existing = registrations.get(sessionId);
    if (existing !== undefined) {
      if (existing.source !== 'fallback' || cachedTools === undefined) return;
      unregisterSession(sessionId);
    }
    const descriptors = cachedTools ?? FALLBACK_TOOLS;
    const source: SessionRegistration['source'] = cachedTools === undefined ? 'fallback' : 'driver';
    const curated = selectCuratedTools(descriptors);
    const disposers: (() => void)[] = [];
    try {
      for (const { raw, descriptor } of curated) {
        const definition = createMcpToolDefinition(scope, {
          name: computerToolName(raw),
          rawName: raw,
          description: descriptor.description,
          inputSchema: descriptor.inputSchema,
          ...(descriptor.outputSchema === undefined
            ? {}
            : { outputSchema: descriptor.outputSchema }),
          call: async (args, execution) => {
            await authorize(execution, sessionId, slug);
            onActivity();
            if (core().registry?.get(slug)?.computerAccess !== true) {
              throw new Error('Computer Access is off for this PersonaBot');
            }
            if (!isComputerRunning()) {
              throw new Error(
                'The Computer is not running; ask the Human to start it from the Computer panel',
              );
            }
            const started = Date.now();
            try {
              const result = await driver.call(raw, args, execution.signal);
              const failed =
                typeof result === 'object' &&
                result !== null &&
                'isError' in result &&
                result.isError === true;
              record(
                slug,
                sessionId,
                definition.name,
                auditSummary(raw, args),
                failed ? 'error' : 'ok',
                Date.now() - started,
                failed ? 'Computer driver reported a tool failure' : undefined,
              );
              return modelVisibleDriverResult(result);
            } catch (error) {
              record(
                slug,
                sessionId,
                definition.name,
                auditSummary(raw, args),
                'error',
                Date.now() - started,
                error instanceof Error ? error.message : String(error),
              );
              throw error;
            }
          },
        });
        disposers.push(scope.tools.register(definition));
      }
      disposers.push(
        scope.systemPrompt.section({
          name: COMPUTER_PROMPT_SECTION,
          order: scope.systemPrompt.getSectionOrder('TOOL_COMPUTER_USE'),
          text: options.guidance?.() ?? COMPUTER_GUIDANCE,
        }),
      );
    } catch (error) {
      for (const dispose of disposers.reverse()) dispose();
      throw error;
    }
    registrations.set(sessionId, { slug, scope, disposers, source });
    note(
      `tools on slug=${slug} session=${sessionId} source=${source} count=${disposers.length - 1}`,
    );
    ctx.logger.info(`botharness-computer: Computer tools on for ${slug} (${sessionId}, ${source})`);
    if (source === 'fallback' && isComputerRunning()) warmCatalog();
  };

  const unregisterSession = (sessionId: string): void => {
    const registration = registrations.get(sessionId);
    if (registration === undefined) return;
    registrations.delete(sessionId);
    for (const dispose of [...registration.disposers].reverse()) dispose();
  };

  const record = (
    botSlug: string,
    sessionId: string,
    tool: string,
    summary: string,
    outcome: 'ok' | 'error',
    durationMs: number,
    error?: string,
  ): void => {
    const rootRole = botSlugOf(sessionId)?.rootRole ?? 'unknown';
    const event: ComputerAuditEvent = {
      at: new Date().toISOString(),
      botSlug,
      sessionId,
      rootRole,
      tool,
      summary,
      outcome,
      durationMs,
      ...(error === undefined ? {} : { error: error.slice(0, 200) }),
    };
    try {
      audit(event);
    } catch {}
  };

  const authorize = async (
    execution: ToolExecution,
    sessionId: string,
    slug: string,
  ): Promise<void> => {
    const agent = execution.agent;
    if (agent === undefined) throw new Error('Computer tools require a PersonaBot session');
    if (granted(sessionId) || isAutoAllowed()) return;
    throw new Error('Computer action is not authorized for this session');
  };

  const onDisposed = function (payload: { agent: Agent }): undefined {
    const sessionId = String(payload.agent.id);
    unregisterSession(sessionId);
    sessions.delete(sessionId);
    grants.delete(sessionId);
    return undefined;
  };

  ctx.on('agent/disposed', onDisposed);

  ctx.inject(['computerUse'], (scope) => {
    const release = scope.computerUse.register(ComputerUseProviderName(COMPUTER_PROVIDER_NAME));
    slotDisposer = () => release();
    return () => {
      slotDisposer = undefined;
    };
  });

  const directCatalog = async (): Promise<
    readonly { raw: string; descriptor: DriverToolDescriptor }[]
  > => {
    if (cachedTools === undefined && isComputerRunning()) {
      warmCatalog();
      await warming?.catch(() => undefined);
    }
    return selectCuratedTools(cachedTools ?? FALLBACK_TOOLS);
  };

  const directTools: ComputerToolProvider['directTools'] = async () =>
    (await directCatalog()).map(({ raw, descriptor }) => ({
      name: computerToolName(raw),
      description: descriptor.description,
      inputSchema: descriptor.inputSchema,
    }));

  const runDirect: ComputerToolProvider['runDirect'] = async (
    slug,
    tool,
    args,
    signal = new AbortController().signal,
  ) => {
    const raw = tool.startsWith('computer_') ? tool.slice('computer_'.length) : tool;
    if (!(await directCatalog()).some((entry) => entry.raw === raw))
      throw new Error(`Unknown Computer tool ${tool}`);
    const name = computerToolName(raw);
    const started = Date.now();
    try {
      onActivity();
      if (core().registry?.get(slug)?.computerAccess !== true)
        throw new Error('Computer Access is off for this PersonaBot');
      if (!isComputerRunning())
        throw new Error('The Computer is not running; start it with computer-start first');
      const result = await driver.call(raw, args, signal);
      const failed =
        typeof result === 'object' &&
        result !== null &&
        'isError' in result &&
        result.isError === true;
      record(
        slug,
        'direct',
        name,
        auditSummary(raw, args),
        failed ? 'error' : 'ok',
        Date.now() - started,
        failed ? 'Computer driver reported a tool failure' : undefined,
      );
      return modelVisibleDriverResult(result);
    } catch (error) {
      record(
        slug,
        'direct',
        name,
        auditSummary(raw, args),
        'error',
        Date.now() - started,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  };

  return {
    directTools,
    runDirect,
    attachAgent(scope, sessionId, info) {
      if (disposed) return;
      sessions.set(sessionId, { scope, disposed: false });
      const access = core().registry?.get(info.botSlug)?.computerAccess === true;
      note(
        `agent setup session=${sessionId} bot=${info.botSlug} role=${info.rootRole} access=${String(access)}`,
      );
      if (access !== true) return;
      try {
        registerSession(sessionId, scope, info.botSlug);
      } catch (error) {
        ctx.logger.warn(
          `botharness-computer: failed to register Computer tools for ${info.botSlug}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },

    needsAuthorization(sessionId) {
      return !granted(sessionId) && !isAutoAllowed();
    },

    markAuthorized(sessionId, scope = authorizationScope()) {
      if (scope !== authorizationScope()) return false;
      grants.set(sessionId, scope);
      return true;
    },

    async reconcileBot(slug) {
      if (disposed) return;
      const access = core().registry?.get(slug)?.computerAccess === true;
      for (const [sessionId, session] of sessions) {
        if (session.disposed) continue;
        const owner = botSlugOf(sessionId);
        if (owner?.botSlug !== slug) continue;
        if (access) {
          registerSession(sessionId, session.scope, slug);
        } else {
          unregisterSession(sessionId);
        }
      }
    },

    async reconcileAll() {
      if (disposed) return;
      warmCatalog();
      for (const bot of core().registry?.list() ?? []) {
        if (bot.computerAccess === true) await this.reconcileBot(bot.slug);
      }
    },

    resetRuntime() {
      catalogEpoch += 1;
      cachedTools = undefined;
      grants.clear();
      for (const sessionId of [...registrations.keys()]) unregisterSession(sessionId);
      for (const [sessionId, session] of sessions) {
        const owner = botSlugOf(sessionId);
        if (owner !== undefined && core().registry?.get(owner.botSlug)?.computerAccess === true)
          registerSession(sessionId, session.scope, owner.botSlug);
      }
    },

    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const sessionId of registrations.keys()) unregisterSession(sessionId);
      sessions.clear();
      grants.clear();
      const release = slotDisposer;
      slotDisposer = undefined;
      if (release !== undefined) await release();
      await driver.close();
    },
  };
}
