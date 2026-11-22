import type { D1Database } from './d1.js';
import { HOST_ID, type HostRow } from './relay-host.js';
import { failure, json, readBody } from './relay-http.js';
import { hmac, verifyBotProof } from './relay-signatures.js';
import type { RelayOptions } from './relay.js';

interface BotNetworkOptions {
  options: Pick<RelayOptions, 'hostKey'>;
  db: D1Database;
  now(): Date;
  owned(id: string, account: string): Promise<HostRow | null>;
  view(row: HostRow): unknown;
  changes(result: unknown): number;
}

export function createBotNetworkHandlers({
  options,
  db,
  now,
  owned,
  view,
  changes,
}: BotNetworkOptions) {
  const registerBotNetwork = async (row: HostRow, request: Request) => {
    if (options.hostKey === undefined) return failure(503, 'bot-network-unavailable');
    const body = await readBody(request, 4096);
    const { hostId, publicKey, issuedAt, proof } = body ?? {};
    if (
      typeof hostId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/u.test(hostId) ||
      typeof publicKey !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(publicKey) ||
      typeof issuedAt !== 'string' ||
      issuedAt.length > 40
    )
      return failure(400, 'invalid-bot-identity');
    if (
      typeof proof !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/u.test(proof) ||
      !(Math.abs(now().getTime() - Date.parse(issuedAt)) <= 60_000)
    )
      return failure(403, 'bot-host-proof-invalid');
    const statement = JSON.stringify({
      purpose: 'bot-network-registration-v1',
      connectHostId: row.id,
      hostId,
      publicKey,
      issuedAt,
    });
    if (!(await verifyBotProof(await options.hostKey(row.id), proof, statement)))
      return failure(403, 'bot-host-proof-invalid');
    if (row.bot_host_id != null && (row.bot_host_id !== hostId || row.bot_public_key !== publicKey))
      return failure(409, 'bot-host-identity-conflict');
    const duplicate = await db
      .prepare('SELECT id FROM hosts WHERE account = ? AND bot_host_id = ? AND id != ?')
      .bind(row.account, hostId, row.id)
      .first();
    if (duplicate !== null) return failure(409, 'bot-host-identity-conflict');
    try {
      const updated = changes(
        await db
          .prepare(`UPDATE hosts SET bot_host_id = ?, bot_public_key = ?
        WHERE id = ? AND account = ? AND (bot_host_id IS NULL OR (bot_host_id = ? AND bot_public_key = ?))`)
          .bind(hostId, publicKey, row.id, row.account, hostId, publicKey)
          .run(),
      );
      if (updated === 0) return failure(409, 'bot-host-identity-conflict');
    } catch {
      const conflict = await db
        .prepare('SELECT id FROM hosts WHERE account = ? AND bot_host_id = ? AND id != ?')
        .bind(row.account, hostId, row.id)
        .first();
      return conflict === null
        ? failure(503, 'bot-network-unavailable')
        : failure(409, 'bot-host-identity-conflict');
    }
    const registered = await owned(row.id, row.account);
    return registered === null
      ? failure(404, 'host-not-found')
      : json(200, { host: view(registered) });
  };

  const botNetworkGrant = async (sender: HostRow, request: Request) => {
    if (options.hostKey === undefined) return failure(503, 'bot-network-unavailable');
    if (sender.bot_host_id == null || sender.bot_public_key == null)
      return failure(409, 'bot-host-unregistered');
    const { recipientId, issuedAt, nonce, proof } = (await readBody(request, 4096)) ?? {};
    if (
      typeof recipientId !== 'string' ||
      !HOST_ID.test(recipientId) ||
      typeof issuedAt !== 'string' ||
      issuedAt.length > 40 ||
      typeof nonce !== 'string' ||
      !/^[a-zA-Z0-9_-]{32,128}$/u.test(nonce)
    )
      return failure(400, 'invalid-bot-peer');
    const statement = JSON.stringify({
      purpose: 'bot-network-grant-v1',
      connectHostId: sender.id,
      recipientId,
      issuedAt,
      nonce,
    });
    if (
      !(Math.abs(now().getTime() - Date.parse(issuedAt)) <= 60_000) ||
      !(await verifyBotProof(await options.hostKey(sender.id), proof, statement))
    )
      return failure(403, 'bot-host-proof-invalid');
    const recipient = await owned(recipientId, sender.account);
    if (recipient === null || recipient.bot_host_id == null || recipient.bot_public_key == null)
      return failure(404, 'host-not-found');
    const identity = (row: HostRow) => ({
      id: row.id,
      hostId: row.bot_host_id,
      publicKey: row.bot_public_key,
    });
    const payload = JSON.stringify({
      purpose: 'bot-network-peer-v1',
      account: sender.account,
      sender: identity(sender),
      recipient: identity(recipient),
      issuedAt: now().toISOString(),
      nonce,
    });
    return json(200, {
      grant: { payload, signature: await hmac(await options.hostKey(recipient.id), payload) },
    });
  };

  return { registerBotNetwork, botNetworkGrant };
}
