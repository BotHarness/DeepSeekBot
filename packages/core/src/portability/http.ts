import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelCatalog } from '../models/catalog.js';
import { validateOperationalSnapshot } from '../database/owner.js';
import { digest, ProfileBackupError } from './files.js';
import {
  exportProfileBackup,
  inspectProfileBackup,
  profileBackupPreview,
  PROFILE_BACKUP_LIMITS,
  type ProfileBackupSource,
} from './package.js';
import type { ProfileRecovery } from './recovery.js';

export const PROFILE_BACKUP_PATH = '/api/botharness/profile-backup';
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

async function body(request: Request, limit: number): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  try {
    while (true) {
      request.signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit)
        throw new ProfileBackupError('too-large', 'Request exceeds documented resource bound');
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export function createProfileBackupHttp(
  source: ProfileBackupSource,
  stagingRoot: string,
  recovery: ProfileRecovery,
  catalog: ModelCatalog,
) {
  let exporting = false;
  const plans = new Map<string, { signature: string; expires: number }>();
  const preview = () => profileBackupPreview(source);
  return async (request: Request): Promise<Response> => {
    let stage: string | undefined;
    const action = new URL(request.url).pathname.slice(PROFILE_BACKUP_PATH.length);
    const operation =
      action === ''
        ? request.method === 'GET'
          ? 'preview'
          : 'export'
        : ['/inspect', '/recovery', '/authorize', '/activate'].includes(action)
          ? action.slice(1)
          : 'request';
    try {
      if (request.method === 'GET' && action === '/recovery')
        return Response.json(await recovery.status(catalog), { headers });
      if (request.method === 'GET' && action === '') {
        const value = preview();
        const token = randomUUID();
        for (const [id, plan] of plans) if (plan.expires < Date.now()) plans.delete(id);
        if (plans.size >= 32) plans.delete(plans.keys().next().value!);
        plans.set(token, { signature: JSON.stringify(value), expires: Date.now() + 5 * 60_000 });
        return Response.json({ ...value, token }, { headers });
      }
      if (request.method !== 'POST') return new Response(null, { status: 405, headers });
      if (action === '/authorize' || action === '/activate') {
        const value = JSON.parse((await body(request, 4096)).toString('utf8'));
        if (typeof value.slug !== 'string')
          throw new ProfileBackupError('invalid-input', 'Bot identity is required');
        if (action === '/authorize') await recovery.authorizeModel(value.slug, catalog);
        else {
          const bot = source.registry.get(value.slug);
          if (!bot?.modelPlan)
            throw new ProfileBackupError('model-plan-required', 'Select an explicit Model Plan');
          await catalog.validate(bot.modelPlan.orchestrator);
          recovery.activate(value.slug, value.acknowledgeSplitBrain === true);
        }
        return Response.json(await recovery.status(catalog), { headers });
      }
      mkdirSync(stagingRoot, { recursive: true });
      stage = mkdtempSync(join(stagingRoot, 'operation-'));
      if (action === '/inspect') {
        const archive = await body(request, PROFILE_BACKUP_LIMITS.maxTotalBytes);
        const { manifest, entries } = inspectProfileBackup(archive);
        const database = join(stage, 'inspection.sqlite');
        writeFileSync(database, entries.find((entry) => entry.path === 'database.sqlite')!.data, {
          flag: 'wx',
          mode: 0o600,
        });
        if (validateOperationalSnapshot(database) !== manifest.schemaGeneration)
          throw new ProfileBackupError(
            'package-invalid',
            'Database schema does not match manifest',
          );
        return Response.json(
          {
            manifest,
            bytes: archive.length,
            sha256: digest(archive),
            restore: 'trusted-local-stopped-profile-only',
          },
          { headers },
        );
      }
      if (action !== '') return new Response(null, { status: 404, headers });
      const value = JSON.parse((await body(request, 4096)).toString('utf8'));
      const plan = plans.get(value.token);
      if (!plan || plan.expires < Date.now() || plan.signature !== JSON.stringify(preview()))
        throw new ProfileBackupError(
          'preview-stale',
          'Environment changed; review a fresh preview',
        );
      if (exporting)
        throw new ProfileBackupError('operation-busy', 'A Profile export is already running');
      plans.delete(value.token);
      exporting = true;
      try {
        const destination = join(stage, 'environment.botharness-backup');
        const result = await exportProfileBackup(source, destination, { signal: request.signal });
        return new Response(new Uint8Array(readFileSync(destination)), {
          headers: {
            ...headers,
            'content-type': 'application/octet-stream',
            'content-length': String(result.bytes),
            'content-disposition': `attachment; filename="environment-${result.id}.botharness-backup"`,
            'x-backup-sha256': result.sha256,
          },
        });
      } finally {
        exporting = false;
      }
    } catch (error) {
      const code = request.signal.aborted
        ? 'cancelled'
        : error instanceof ProfileBackupError
          ? error.code
          : 'operation-failed';
      source.log?.(
        `profile-backup initiator=human operation=${operation} phase=refused reason=${code}`,
      );
      return Response.json(
        {
          error: {
            code,
            operation,
            message:
              error instanceof ProfileBackupError
                ? error.message
                : 'Environment operation failed; inspect developer diagnostics',
          },
        },
        { status: 400, headers },
      );
    } finally {
      if (stage && existsSync(stage)) rmSync(stage, { recursive: true, force: true });
    }
  };
}
