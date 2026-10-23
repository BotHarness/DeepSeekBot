import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function prepareZipImportProof({ root, home, port, sourceSlug, rpc, cookie, env }) {
  const response = await fetch(
    `http://127.0.0.1:${port}/api/botharness/bot-zip?slug=${encodeURIComponent(sourceSlug)}`,
    {
      headers: { cookie: cookie() },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new Error('Zip proof source export failed');
  const archive = Buffer.from(await response.arrayBuffer());
  const file = join(home, 'zip-import-proof.zip');
  writeFileSync(file, archive);
  const identity = {
    uploadKey: 'e2e-zip-upload-001',
    sha256: createHash('sha256').update(archive).digest('hex'),
    sizeBytes: archive.length,
  };
  const input = {
    ...identity,
    operationKey: 'e2e-zip-import-001',
    displayName: 'Recovered Zip Bot',
    description: 'Zip receipt proof',
    roles: ['portable'],
  };
  const call = (method, args) => rpc(port, 'botharness', method, args);
  const cli = (instance, command, args) => {
    const login = new URL(instance.url);
    const token = login.searchParams.get('token');
    if (!token) throw new Error('Zip proof Host login is unavailable');
    const result = spawnSync(
      process.execPath,
      [
        join(root, 'packages', 'deepseekbot', 'dist', 'deepseekbot.mjs'),
        command,
        '--host',
        login.origin,
        '--timeout',
        '30',
        ...args,
      ],
      {
        cwd: root,
        env: { ...env, DEEPSEEKBOT_HOST_TOKEN: token },
        encoding: 'utf8',
        timeout: 45_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
    );
    if (result.error || result.status !== 0)
      throw new Error(`Zip proof CLI ${command} failed (${result.status ?? 'unknown'})`);
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new Error('Zip proof CLI did not return JSON');
    }
  };
  const sourceArgs = [
    '--upload-key',
    identity.uploadKey,
    '--archive-sha256',
    identity.sha256,
    '--archive-size',
    String(identity.sizeBytes),
  ];
  const metadataArgs = [
    '--operation-key',
    input.operationKey,
    '--name',
    input.displayName,
    '--description',
    input.description,
    '--role',
    input.roles[0],
  ];
  const absent = await call('zipImportLookup', input);
  if (absent.receipt !== null) throw new Error('Zip proof lookup unexpectedly found an operation');
  const begun = await call('zipUploadBegin', identity);
  if (begun.offset !== 0 || begun.chunkBytes !== 262_144)
    throw new Error('Zip proof staging did not start empty');
  const chunk = {
    ...identity,
    offset: 0,
    dataBase64: archive.subarray(0, 262_144).toString('base64'),
  };
  await call('zipUploadChunk', chunk);
  return {
    async finishAfterUploadRestart(instance) {
      const resumed = await call('zipUploadBegin', identity);
      if (resumed.offset !== Math.min(262_144, archive.length))
        throw new Error('Zip upload did not survive Host restart');
      const replayed = await call('zipUploadChunk', chunk);
      if (replayed.offset !== resumed.offset)
        throw new Error('Zip duplicate chunk changed the accepted offset');
      const uploaded = cli(instance, 'bot-zip-upload', [
        '--upload-key',
        identity.uploadKey,
        '--from-zip',
        file,
      ]);
      if (uploaded.offset !== archive.length || uploaded.sha256 !== identity.sha256)
        throw new Error('Zip CLI did not finish the same upload');
      const preview = cli(instance, 'bot-zip-preview', sourceArgs);
      if (preview.source?.sha256 !== identity.sha256 || preview.fileCount < 1)
        throw new Error('Zip preview did not bind the uploaded archive');
      const beforeBots = (await call('list', {})).bots.length;
      const beforeChannels = (await call('channels', {})).channels.length;
      await call('zipImport', input);
      const receipt = (await call('zipImportLookup', input)).receipt;
      const assertReceipt = (actual) => {
        if (
          !receipt ||
          receipt.status !== 'created' ||
          actual?.status !== 'created' ||
          actual.operationKey !== input.operationKey ||
          actual.botSlug !== receipt.botSlug ||
          actual.channelId !== receipt.channelId
        )
          throw new Error('Zip recovery changed the Bot or DM');
      };
      const verify = async (current) => {
        assertReceipt((await call('zipImportLookup', input)).receipt);
        assertReceipt(
          cli(current, 'bot-zip-import-status', [
            '--archive-sha256',
            identity.sha256,
            ...metadataArgs,
          ]).receipt,
        );
        assertReceipt(cli(current, 'bot-zip-import', [...sourceArgs, ...metadataArgs]).receipt);
        const bots = (await call('list', {})).bots;
        const channels = (await call('channels', {})).channels;
        if (
          bots.length !== beforeBots + 1 ||
          channels.length !== beforeChannels + 1 ||
          !bots.some((bot) => bot.slug === receipt.botSlug) ||
          !channels.some((channel) => channel.id === receipt.channelId)
        )
          throw new Error('Zip import duplicated its Bot or DM');
      };
      await verify(instance);
      return { verifyAfterImportRestart: verify };
    },
  };
}
