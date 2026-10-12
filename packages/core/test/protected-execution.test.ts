import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProtectedExecution, privateCommandArgs } from '../src/credentials/protected-execution.js';
import { createTempRoot } from './helpers.js';

const executions: ProtectedExecution[] = [];
afterEach(async () => {
  await Promise.all(executions.splice(0).map((execution) => execution.close()));
});

describe('qualified CLI output boundary', () => {
  it.skipIf(process.env.BOTHARNESS_PRIVATE_DOCKER_QA !== '1')(
    'refuses active Host-file, environment, Docker socket and network extraction from arbitrary commands',
    async () => {
      const canary = 'SYNTHETIC-active-extraction-1380';
      const file = join(createTempRoot('bh-private-host-canary-'), '.credentials.yaml');
      writeFileSync(file, canary);
      const quoted = "'" + file.replaceAll('\\', '/').replaceAll("'", "'\\''") + "'";
      const execution = new ProtectedExecution(() => undefined);
      executions.push(execution);
      expect(await execution.qualified()).toBe(true);
      const output = await execution.command(
        `
printf 'ordinary-cli-ok\\n'
id
env
if test -e ${quoted}; then cat ${quoted} | base64; else printf 'host-file-unavailable\\n'; fi
if test -e /var/run/docker.sock; then printf 'docker-socket-exposed\\n'; else printf 'docker-socket-unavailable\\n'; fi
find / -name .credentials.yaml 2>/dev/null
node -e "fetch('http://127.0.0.1:31381/evidence').then(()=>console.log('network-exposed')).catch(()=>console.log('network-unavailable'))"
`,
        new AbortController().signal,
      );
      expect(output).toContain('ordinary-cli-ok');
      expect(output).toContain('uid=65534');
      expect(output).toContain('host-file-unavailable');
      expect(output).toContain('docker-socket-unavailable');
      expect(output).toContain('network-unavailable');
      expect(output).not.toContain('network-exposed');
      expect(output).not.toContain('DEEPSEEK_API_KEY');
      expect(output).not.toContain(canary);
      expect(output).not.toContain(Buffer.from(canary).toString('base64'));
    },
  );

  it('authenticates a real CLI request while discarding an echoing server body, headers and errors', async () => {
    const canary = 'SYNTHETIC-output-canary-1380';
    let authenticated = false;
    const server = createServer((request, response) => {
      authenticated =
        request.headers['x-api-key'] === canary &&
        request.headers['x-api-secret'] === canary + '-secret';
      response.writeHead(authenticated ? 200 : 401, { 'x-secret-echo': canary });
      response.end(canary + Buffer.from(canary).toString('base64'));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('missing server');
    const execution = new ProtectedExecution(() => undefined);
    executions.push(execution);
    try {
      const result = await execution.authenticatedStatus(
        {
          endpoint: `http://127.0.0.1:${address.port}/private?marker=${canary}`,
          api_key: canary,
          api_secret: canary + '-secret',
        },
        new AbortController().signal,
      );
      expect(authenticated).toBe(true);
      expect(result).toEqual({ consumer: 'http-status-v1', successful: true, httpStatus: 200 });
      expect(JSON.stringify(result)).not.toContain(canary);
      const refused = await execution.authenticatedStatus(
        {
          endpoint: `http://127.0.0.1:${address.port}/private?marker=${canary}`,
          api_key: canary + '-stale',
          api_secret: canary + '-secret',
        },
        new AbortController().signal,
      );
      expect(refused).toEqual({
        consumer: 'http-status-v1',
        successful: false,
        httpStatus: 401,
        action:
          'Replace private information in Web Chat and retry; remote authorization may also need repair.',
      });
      expect(JSON.stringify(refused)).not.toContain(canary);
      await expect(
        execution.authenticatedStatus(
          { endpoint: canary, api_key: canary, api_secret: canary },
          new AbortController().signal,
        ),
      ).rejects.toThrow('Protected execution failed or was cancelled');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('does not expose mount, network, privilege or command-line environment injection', () => {
    const args = privateCommandArgs('synthetic-probe');
    expect(args).toContain('none');
    expect(args).toContain('no-new-privileges=true');
    expect(args).not.toContain('--mount');
    expect(args).not.toContain('--volume');
    expect(args).not.toContain('--env');
    expect(args).not.toContain('--privileged');
  });
});
