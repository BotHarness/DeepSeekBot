import { asObject, invalidInput, type BridgeResult } from '../../bridge/method-utils.js';
import type {
  ReleaseInfo,
  ReleaseInstall,
  ReleaseRestart,
  ReleaseUpdate,
} from '../../release/service.js';
import type { PluginInstall, PluginRestart, PluginUpdates } from '../../release/plugins.js';
import { isUpdateRequestId, type UpdateCancel, type UpdateRun } from '../../release/update-runs.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';

function releaseUnavailable(): BridgeResult<never> {
  return {
    ok: false,
    error: {
      code: 'release-unavailable',
      message: 'Release information is unavailable',
    },
  };
}

export interface ReleaseAdapterMethods {
  releaseInfo(payload: unknown): BridgeResult<ReleaseInfo>;
  releaseUpdate(payload?: unknown): Promise<BridgeResult<ReleaseUpdate>>;
  releaseInstall(payload: unknown): Promise<BridgeResult<ReleaseInstall>>;
  releaseRestart(payload: unknown): Promise<BridgeResult<ReleaseRestart>>;
  pluginUpdates(payload?: unknown): Promise<BridgeResult<PluginUpdates>>;
  pluginInstall(payload: unknown): Promise<BridgeResult<PluginInstall>>;
  pluginRestart(payload: unknown): Promise<BridgeResult<PluginRestart>>;
  updateRun(payload?: unknown): BridgeResult<UpdateRun | null>;
  updateCancel(payload: unknown): Promise<BridgeResult<UpdateCancel>>;
}

export function createReleaseAdapterMethods(deps: BridgeMethodsDeps): ReleaseAdapterMethods {
  return {
    releaseInfo(payload) {
      if (deps.release === undefined) return releaseUnavailable();
      const since = asObject(payload)['since'];
      if (since !== undefined && typeof since !== 'string') return invalidInput('invalid since');
      return { ok: true, value: deps.release.info(since) };
    },
    async releaseUpdate(payload) {
      if (deps.release === undefined) return releaseUnavailable();
      const force = asObject(payload)['force'];
      if (force !== undefined && typeof force !== 'boolean') return invalidInput('invalid force');
      return { ok: true, value: await deps.release.update(force) };
    },
    async releaseInstall(payload) {
      if (deps.release === undefined) return releaseUnavailable();
      const source = asObject(payload);
      const version = source['version'];
      const requestId = source['requestId'];
      if (typeof version !== 'string') return invalidInput('version is required');
      if (requestId !== undefined && !isUpdateRequestId(requestId))
        return invalidInput('invalid requestId');
      return {
        ok: true,
        value: await deps.release.install(version, undefined, requestId),
      };
    },
    async releaseRestart() {
      if (deps.release === undefined) return releaseUnavailable();
      return { ok: true, value: await deps.release.restart() };
    },
    async pluginUpdates(payload) {
      if (deps.plugins === undefined) return releaseUnavailable();
      const force = asObject(payload)['force'];
      if (force !== undefined && typeof force !== 'boolean') return invalidInput('invalid force');
      return { ok: true, value: await deps.plugins.list(force) };
    },
    async pluginInstall(payload) {
      if (deps.plugins === undefined) return releaseUnavailable();
      const source = asObject(payload);
      const name = source['name'];
      const version = source['version'];
      if (typeof name !== 'string') return invalidInput('name is required');
      const requestId = source['requestId'];
      if (typeof version !== 'string') return invalidInput('version is required');
      if (requestId !== undefined && !isUpdateRequestId(requestId))
        return invalidInput('invalid requestId');
      return {
        ok: true,
        value: await deps.plugins.install(name, version, undefined, requestId),
      };
    },
    async pluginRestart() {
      if (deps.plugins === undefined) return releaseUnavailable();
      return { ok: true, value: await deps.plugins.restart() };
    },
    updateRun(payload) {
      if (deps.updates === undefined) return releaseUnavailable();
      const id = asObject(payload)['id'];
      if (id !== undefined && !isUpdateRequestId(id)) return invalidInput('invalid id');
      return { ok: true, value: deps.updates.get(id) ?? null };
    },
    async updateCancel(payload) {
      if (deps.updates === undefined) return releaseUnavailable();
      const id = asObject(payload)['id'];
      if (!isUpdateRequestId(id)) return invalidInput('id is required');
      return { ok: true, value: await deps.updates.cancel(id) };
    },
  };
}
