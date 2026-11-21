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
