import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Worker, workerData } from 'node:worker_threads';

const TEST_KEY = 'm15-unused-voice-key';
const HEADER_VALUE = 'm15-private-voice-header';
const HEADER_NAME = 'x-m15-voice-fixture';

if (workerData?.m15VoiceRequests instanceof SharedArrayBuffer) {
  const requests = new Int32Array(workerData.m15VoiceRequests);
  const server = createServer((request, response) => {
    Atomics.add(requests, 0, 1);
    request.resume();
    if (
      request.method !== 'POST' ||
      request.headers.authorization !== `Bearer ${TEST_KEY}` ||
      request.headers[HEADER_NAME] !== HEADER_VALUE
    ) {
      response.writeHead(400).end();
      return;
    }
    if (request.url === '/tts-updated') {
      const silentWav = Buffer.from(
        '524946462600000057415645666d74201000000001000100803e0000007d00000200100064617461020000000000',
        'hex',
      );
      response.writeHead(200, { 'content-type': 'audio/wav' }).end(silentWav);
    } else if (request.url === '/asr-updated') {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"text":"fixture"}');
    } else response.writeHead(404).end();
  });
  server.listen(0, '127.0.0.1', () => process.stdout.write(String(server.address().port)));
}

export async function runVoiceProviderGate(s, { as }, check) {
  const requests = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const worker = new Worker(new URL(import.meta.url), {
    workerData: { m15VoiceRequests: requests.buffer },
    stdout: true,
  });
  try {
    const [port] = await Promise.race([
      once(worker.stdout, 'data'),
      once(worker, 'exit').then(() => {
        throw new Error('Voice fixture exited before listening');
      }),
    ]);
    const origin = `http://127.0.0.1:${port}`;
    const disclosesFixture = (value) => {
      const json = JSON.stringify(value);
      return [TEST_KEY, HEADER_VALUE, HEADER_NAME, origin].some((marker) => json.includes(marker));
    };
    const owner = (args, input) => s.cli(args, { input });
    const refused = (label, args, input) => {
      const result = s.cli(args, { as, input, allowFail: true });
      check(
        `Member ${label} refused without disclosure`,
        result?.error?.code === 'remote-access/denied' && !disclosesFixture(result),
        result?.error?.code,
      );
    };
    const before = owner(['voice-providers']);
    for (const kind of ['tts', 'asr']) {
      const template = {
        version: 1,
        url: `${origin}/${kind}`,
        method: 'POST',
        auth: { kind: 'bearer' },
        headers: { [HEADER_NAME]: HEADER_VALUE },
        ...(kind === 'tts'
          ? { body: { kind: 'json', value: { text: '{text}' } }, result: { kind: 'audio' } }
          : {
              body: { kind: 'multipart', fields: { file: '{audio}' } },
              result: { kind: 'text', path: 'text' },
            }),
      };
      const file = join(s.secrets, `${kind}-voice-template.json`);
      const templateFile = ['--template-file', file];
      writeFileSync(file, JSON.stringify(template), { mode: 0o600 });
      const validate = ['voice-template-validate', '--kind', kind, ...templateFile];
      refused(`${kind} template validation`, validate);
      check(`Owner validates ${kind} template`, owner(validate).valid === true);

      const add = ['voice-provider-add', 'custom', '--kind', kind, ...templateFile, '--key-stdin'];
      refused(`${kind} custom provider add`, add, TEST_KEY);
      const { provider } = owner(add, TEST_KEY);
      check(
        `Owner adds ${kind} custom provider`,
        provider?.hasTemplate === true && provider.keySet === true,
      );
      const { id } = provider;
      const read = ['voice-provider-template', id];
      refused(`${kind} template read`, read);
      check(`Owner reads ${kind} template`, isDeepStrictEqual(owner(read).template, template));

      const updated = { ...template, url: `${template.url}-updated` };
      writeFileSync(file, JSON.stringify(updated));
      const set = ['voice-provider-template-set', id, ...templateFile];
      refused(`${kind} template set`, set);
      check(
        `Denied ${kind} edit left the template intact`,
        isDeepStrictEqual(owner(read).template, template),
      );
      owner(set);
      check(`Owner replaces ${kind} template`, isDeepStrictEqual(owner(read).template, updated));

      const list = s.cli(['voice-providers'], { as, allowFail: true });
      const rows = kind === 'tts' ? list.providers : list.asrProviders;
      check(
        `Member sees ${kind} template presence`,
        rows?.find((row) => row.id === id)?.hasTemplate === true,
      );
      check(
        `Member list contains no ${kind} endpoint, template, header or key values`,
        !disclosesFixture(list) &&
          !/https?:\/\/|"(?:template|url|headers?|key|apiKey)"\s*:/iu.test(JSON.stringify(list)),
      );

      const test = ['voice-provider-test', id];
      const beforeTest = Atomics.load(requests, 0);
      refused(`${kind} provider test`, test);
      check(`Denied ${kind} test made no HTTP request`, Atomics.load(requests, 0) === beforeTest);
      check(
        `Owner tests ${kind} provider`,
        owner(test).ok === true && Atomics.load(requests, 0) === beforeTest + 1,
      );

      owner(['voice-default-set', kind, id]);
      const defaults = ['voice-default-set', kind, 'off'];
      refused(`${kind} default change`, defaults);
      check(
        `Denied ${kind} default change left the binding intact`,
        owner(['voice-defaults']).defaults[kind]?.providerId === id,
      );
      check(`Owner clears ${kind} default`, owner(defaults).defaults[kind] === null);
      const remove = ['voice-provider-remove', id];
      refused(`${kind} provider remove`, remove);
      check(`Owner removes ${kind} provider`, owner(remove).provider?.id === id);
      const priorDefault = before.defaults[kind];
      if (priorDefault !== null) {
        const restore = ['voice-default-set', kind, priorDefault.providerId];
        if (priorDefault.voiceId !== undefined) restore.push('--voice', priorDefault.voiceId);
        if (priorDefault.language !== undefined) restore.push('--language', priorDefault.language);
        owner(restore);
      }
    }

    const addPreset = ['voice-provider-add', 'local'];
    refused('preset provider add', addPreset);
    const { provider } = owner(addPreset);
    check('Owner adds a preset provider', provider?.preset === 'local');
    owner(['voice-provider-remove', provider.id]);
    check(
      'Voice providers and defaults restored',
      isDeepStrictEqual(owner(['voice-providers']), before),
    );
  } finally {
    await worker.terminate();
  }
}
