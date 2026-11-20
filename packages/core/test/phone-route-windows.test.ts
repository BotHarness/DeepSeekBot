import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it.skipIf(process.platform !== 'win32')(
  'detects the phone route from a detached Windows Host without a console',
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'botharness-route-process-'));

    const driver = join(home, 'host.mjs');
    const result = join(home, 'result.json');
    const routes = fileURLToPath(new URL('../src/devices/routes.ts', import.meta.url));
    const fixture = join(home, 'fixture.cs');
    await writeFile(
      fixture,
      `
using System;
class Fixture {
  static void Main(string[] args) {
    Console.Write(args[0] == "status"
      ? "{\\\"BackendState\\\":\\\"Running\\\",\\\"Self\\\":{\\\"DNSName\\\":\\\"fixture.tail1.ts.net.\\\"}}"
      : "{\\\"Web\\\":{\\\"fixture.tail1.ts.net:443\\\":{\\\"Handlers\\\":{\\\"/\\\":{\\\"Proxy\\\":\\\"http://127.0.0.1:4100\\\"}}}}}");
  }
}
`,
    );
    const compiler = join(
      process.env['WINDIR'] ?? 'C:\\Windows',
      'Microsoft.NET',
      'Framework64',
      'v4.0.30319',
      'csc.exe',
    );
    execFileSync(compiler, ['/nologo', `/out:${join(home, 'tailscale.exe')}`, fixture], {
      windowsHide: true,
    });
    await writeFile(
      driver,
      `
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const sourcePath = process.argv[2];
let source = readFileSync(sourcePath, 'utf8');
for (const name of ['lan-address', 'route-targets'])
  source = source.replace('./' + name + '.js', pathToFileURL(join(dirname(sourcePath), name + '.ts')).href);
const module = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
writeFileSync(process.argv[3], JSON.stringify(await module.detectPhoneRoutes({ port: 4100 })));
`,
    );
    const child = spawn(process.execPath, [driver, routes, result], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PATH: `${home}${delimiter}${process.env['PATH'] ?? ''}`,
      },
    });
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
      });
      expect(code).toBe(0);
      expect(JSON.parse(await readFile(result, 'utf8'))).toMatchObject({
        tailscale: 'running',
        routes: expect.arrayContaining([
          { url: 'https://fixture.tail1.ts.net', kind: 'tailscale', ready: true },
        ]),
      });
    } finally {
      if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
        child.kill();
        await new Promise((resolve) => child.once('exit', resolve));
      }
      await rm(home, { recursive: true, force: true });
    }
  },
  20000,
);
