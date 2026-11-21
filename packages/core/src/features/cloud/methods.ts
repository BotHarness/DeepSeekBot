import { invalidInput, type BridgeResult } from '../../bridge/method-utils.js';
import { type CloudWork } from '../../cloud/work.js';
import { runCloudWorkDirect } from '../../cloud/work-tool.js';
import {
  manageCloud,
  parseCloudManagement,
  type CloudManagementResult,
} from '../../cloud/management.js';
import { ClientError as CloudError } from '../../cloud/instance-contract.js';
import { z } from 'zod';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';

export interface CloudBridgeMethods {
  cloudConnections(payload: unknown): Promise<BridgeResult<CloudManagementResult>>;
  cloudWork(payload: unknown): Promise<BridgeResult<Awaited<ReturnType<CloudWork['run']>>>>;
}

export function createCloudBridgeMethods(deps: BridgeMethodsDeps): CloudBridgeMethods {
  return {
    async cloudWork(payload) {
      const parsed = z
        .object({ slug: z.string().min(1), input: z.unknown() })
        .strict()
        .safeParse(payload);
      if (!parsed.success || !deps.registry.get(parsed.data.slug))
        return invalidInput('Known bot and cloud work input required');
      try {
        if (!deps.cloudWork) throw new CloudError('CLOUD_UNAVAILABLE');
        return {
          ok: true,
          value: await runCloudWorkDirect(deps.cloudWork, parsed.data.slug, parsed.data.input),
        };
      } catch (error) {
        const code = error instanceof CloudError ? error.code : 'CLOUD_WORK_UNAVAILABLE';
        return { ok: false, error: { code, message: code } };
      }
    },
    async cloudConnections(payload) {
      try {
        if (!deps.cloudConnections) throw new CloudError('CLOUD_UNAVAILABLE');
        return {
          ok: true,
          value: await manageCloud(deps.cloudConnections, parseCloudManagement(payload)),
        };
      } catch (error) {
        const code = error instanceof CloudError ? error.code : 'CLOUD_UNAVAILABLE';
        return { ok: false, error: { code, message: code } };
      }
    },
  };
}
