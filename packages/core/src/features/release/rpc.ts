import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type {
  ReleaseInfo,
  ReleaseInstall,
  ReleaseRestart,
  ReleaseUpdate,
} from '../../release/service.js';
import type { PluginInstall, PluginRestart, PluginUpdates } from '../../release/plugins.js';
import type { UpdateCancel, UpdateRun } from '../../release/update-runs.js';
import type { ReleaseAdapterMethods } from './methods.js';

export async function releaseInfo(
  methods: ReleaseAdapterMethods,
  since?: string,
): Promise<ReleaseInfo> {
  return unwrap(methods.releaseInfo(since === undefined ? {} : { since }));
}

export async function releaseUpdate(
  methods: ReleaseAdapterMethods,
  force?: boolean,
): Promise<ReleaseUpdate> {
  return unwrapAsync(methods.releaseUpdate({ force }));
}

export async function releaseInstall(
  methods: ReleaseAdapterMethods,
  version: string,
  requestId?: string,
): Promise<ReleaseInstall> {
  return unwrapAsync(
    methods.releaseInstall(requestId === undefined ? { version } : { version, requestId }),
  );
}

export async function releaseRestart(methods: ReleaseAdapterMethods): Promise<ReleaseRestart> {
  return unwrapAsync(methods.releaseRestart({}));
}

export async function pluginUpdates(
  methods: ReleaseAdapterMethods,
  force?: boolean,
): Promise<PluginUpdates> {
  return unwrapAsync(methods.pluginUpdates({ force }));
}

export async function pluginInstall(
  methods: ReleaseAdapterMethods,
  name: string,
  version: string,
  requestId?: string,
): Promise<PluginInstall> {
  return unwrapAsync(
    methods.pluginInstall(
      requestId === undefined ? { name, version } : { name, version, requestId },
    ),
  );
}

export async function pluginRestart(methods: ReleaseAdapterMethods): Promise<PluginRestart> {
  return unwrapAsync(methods.pluginRestart({}));
}

export function updateRun(methods: ReleaseAdapterMethods, id?: string): UpdateRun | null {
  return unwrap(methods.updateRun(id === undefined ? {} : { id }));
}

export async function updateCancel(
  methods: ReleaseAdapterMethods,
  id: string,
): Promise<UpdateCancel> {
  return unwrapAsync(methods.updateCancel({ id }));
}
