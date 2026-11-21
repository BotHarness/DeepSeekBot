import { TeamService } from '../../team/service.js';
import {
  createEngineMemoryTools,
  ENGINE_MEMORY_TOOL_NAMES,
} from '../../engines/engine-memory-tools.js';
import type { Context } from '@deepseek-ai/cordis';
import { createMemoryImageHttp, MEMORY_IMAGE_PATH } from '../../memory/image-http.js';
import { createMemoryFileHttp, MEMORY_FILE_DOWNLOAD_PATH } from '../../memory/file-http.js';
import { createMemoryService } from '../../memory/service.js';
import type { BotHarnessCore, createCore } from '../../plugin.js';
type CoreOptions = NonNullable<Parameters<typeof createCore>[0]>;

export function apply({
  registry,
  ownership,
  operationalDatabase,
  team,
  options,
}: {
  registry: BotHarnessCore['registry'];
  ownership: BotHarnessCore['ownership'];
  operationalDatabase: BotHarnessCore['operationalDatabase'];
  team: Pick<TeamService, 'privateAccess'>;
  options: Pick<CoreOptions, 'warn'>;
}) {
  const memory = createMemoryService({
    registry,
    ownership,
    database: operationalDatabase,
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  team.privateAccess.bind({ registry, memory });
  return memory;
}

export function mountEngineTools(
  ctx: Context,
  core: Pick<BotHarnessCore, 'registry' | 'contributeEngineTools' | 'hostTools'>,
) {
  ctx.effect(
    () =>
      core.contributeEngineTools(({ botSlug }) =>
        createEngineMemoryTools(() => core.registry.memoryDirFor(botSlug)),
      ),
    'botharness: engine Memory tools',
  );
  for (const name of ENGINE_MEMORY_TOOL_NAMES) core.hostTools.add(name);
  ctx.effect(
    () => () => {
      for (const name of ENGINE_MEMORY_TOOL_NAMES) core.hostTools.delete(name);
    },
    'botharness: engine Memory tool names',
  );
}

export function mountFetch(
  connectionCtx: Context,
  fetch: {
    register(route: {
      path: string;
      methods: readonly ('GET' | 'POST')[];
      requestBody: 'buffered' | 'streaming';
      fetch(request: Request): Promise<Response>;
    }): () => Promise<void>;
  },
  core: Pick<BotHarnessCore, 'memory'>,
) {
  connectionCtx.effect(
    () =>
      fetch.register({
        path: MEMORY_FILE_DOWNLOAD_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: createMemoryFileHttp(core.memory),
      }),
    'botharness: current Memory file download',
  );
  connectionCtx.effect(
    () =>
      fetch.register({
        path: MEMORY_IMAGE_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: createMemoryImageHttp(core.memory),
      }),
    'botharness: version-bound Memory PNG preview',
  );
}
