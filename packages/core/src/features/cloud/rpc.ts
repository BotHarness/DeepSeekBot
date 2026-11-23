import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrapAsync } from '../../bridge/rpc-result.js';
import type { CloudManagementInput, CloudManagementResult } from '../../cloud/management.js';
import type { CloudWork, CloudWorkInput } from '../../cloud/work.js';
import type { CloudBridgeMethods } from './methods.js';

export function cloudConnections(
  methods: CloudBridgeMethods,
  input: CloudManagementInput,
): Promise<CloudManagementResult> {
  return unwrapAsync(methods.cloudConnections(input));
}

export function cloudWork(
  methods: CloudBridgeMethods,
  slug: string,
  input: CloudWorkInput,
): Promise<Awaited<ReturnType<CloudWork['run']>>> {
  return unwrapAsync(methods.cloudWork({ slug, input }));
}

export const cloudServiceRpc = {
  cloudConnections(input: CloudManagementInput): Promise<CloudManagementResult> {
    return cloudConnections(this.methods, input);
  },

  cloudWork(slug: string, input: CloudWorkInput): Promise<Awaited<ReturnType<CloudWork['run']>>> {
    return cloudWork(this.methods, slug, input);
  },
} satisfies ThisType<BridgeRpcReceiver>;
