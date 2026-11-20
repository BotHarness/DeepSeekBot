import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { basename } from 'node:path';

const DEFAULT_CONTAINER = 'botharness-computer';
const DEFAULT_VOLUME = 'botharness-computer-config';

const HASH_PATHS = [
  '/config/workspace/tb154-marker.txt',
  '/config/workspace/deep/nested/note.md',
  '/config/.config/autostart/chromium.desktop',
  '/config/Desktop/chromium.desktop',
  '/config/.bashrc',
];

function parseArgs(argv) {
  const options = { url: '', container: '', volume: '', exportDir: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    switch (flag) {
      case '--url':
        options.url = next ?? '';
        index += 1;
        break;
      case '--container':
        options.container = next ?? '';
        index += 1;
        break;
      case '--volume':
        options.volume = next ?? '';
        index += 1;
        break;
      case '--export-dir':
        options.exportDir = next ?? '';
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`unknown option: ${flag}`);
    }
  }
  if (options.url === '') throw new Error('--url <token-url> is required');
  if (options.container === '') throw new Error('--container <name> is required');
  if (options.volume === '') throw new Error('--volume <name> is required');
  if (options.exportDir === '') throw new Error('--export-dir <path> is required');
  if (options.container === DEFAULT_CONTAINER || options.volume === DEFAULT_VOLUME) {
    throw new Error('refusing to operate on the default container/volume names');
  }
  return options;
}

function splitBase(url) {
  const marker = '/?token=';
  const at = url.indexOf(marker);
  if (at < 0) throw new Error('--url must be the dev-instance token URL (…/?token=…)');
  return { base: url.slice(0, at), token: url.slice(at + marker.length) };
}

async function handshake(base, token) {
  await fetch(`${base}/?token=${token}`, { redirect: 'manual' });
  const login = await fetch(`${base}/?token=${token}`, { redirect: 'manual' });
  const setCookie = login.headers.get('set-cookie');
  if (setCookie === null) throw new Error('token handshake returned no session cookie');
  return setCookie.split(';')[0] ?? '';
}

async function getStatus(base, cookie) {
  const response = await fetch(`${base}/api/computer/status`, {
    signal: AbortSignal.timeout(15_000),
    headers: { cookie },
  });
  if (response.status === 404) {
    throw new Error(
      'computer routes not registered (HTTP 404): is @botharness/computer in dsh.profile.bundles?',
    );
  }
  if (response.status !== 200) throw new Error(`status route returned HTTP ${response.status}`);
  return JSON.parse(await response.text());
}

async function postJson(base, cookie, path, body, timeoutMs = 30_000) {
  const response = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(timeoutMs),
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, text };
}

async function waitForState(base, cookie, want, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = '?';
  for (;;) {
    const status = await getStatus(base, cookie);
    last = status?.status?.state ?? '?';
    if (last === want) return status;
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for state=${want} (last=${last})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
}

function docker(args) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 300_000,
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
}

function dockerExec(container, script) {
  const result = docker(['exec', container, 'sh', '-c', script]);
  if (result.status !== 0) {
    throw new Error(`docker exec failed (${result.status}): ${result.stderr.trim() || script}`);
  }
  return result.stdout;
}

function countBrowsers(container) {
  const script =
    'n=0; for p in /proc/[0-9]*; do c=$(cat "$p/comm" 2>/dev/null) || continue; case "$c" in chromium|chrome) n=$((n+1)) ;; esac; done; echo "$n"';
  return Number.parseInt(dockerExec(container, script).trim(), 10) || 0;
}

function seedMarkers(container) {
  const script = [
    'mkdir -p /config/workspace/deep/nested',
    `printf 'tb154-marker\\n%s\\n' "$(date -u +%FT%TZ)" > /config/workspace/tb154-marker.txt`,
    `printf 'nested note for #154 round-trip\\n' > /config/workspace/deep/nested/note.md`,
    'chown -R abc:abc /config/workspace',
    'test -d /config/workspace || exit 1',
  ].join(' && ');
  dockerExec(container, script);
}

function hashVolumeFiles(container) {
  const script = `for f in ${HASH_PATHS.join(' ')}; do if [ -f "$f" ]; then sha256sum "$f"; else echo "MISSING  $f"; fi; done`;
  return dockerExec(container, script)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .sort()
    .join('\n');
}

async function watchPhases(base, cookie, stop, samples) {
  while (!stop.done) {
    try {
      const status = await getStatus(base, cookie);
      const state = status?.status?.state ?? '?';
      const phase = status?.status?.phase;
      const last = samples[samples.length - 1];
      if (last === undefined || last.state !== state || last.phase !== phase) {
        samples.push({ at: Date.now(), state, phase: phase ?? null });
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { base, token } = splitBase(options.url);
  mkdirSync(options.exportDir, { recursive: true });
  const checks = [];
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok, detail });
    if (!options.json) {
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`);
    }
  };
  const timings = {};
  const phases = [];

  const cookie = await handshake(base, token);

  const initial = await getStatus(base, cookie);
  check(
    'status-route',
    initial?.provider === 'docker' && initial?.exportDir === options.exportDir,
    `provider=${initial?.provider ?? '?'} exportDir=${initial?.exportDir ?? '?'}`,
  );
  check(
    'runtime-available',
    initial?.probe?.available === true,
    initial?.probe?.detail ?? `available=${initial?.probe?.available}`,
  );

  const started = await postJson(base, cookie, '/api/computer/start', { authorize: true });
  check(
    'start-accepted',
    started.status === 200 && started.body?.ok === true,
    `HTTP ${started.status}`,
  );
  await waitForState(base, cookie, 'running', 300_000);
  check('reaches-running', true, '');

  const cycledStop = await postJson(base, cookie, '/api/computer/stop', { authorize: true });
  check(
    'cycle-stop-accepted',
    cycledStop.status === 200 && cycledStop.body?.ok === true,
    `HTTP ${cycledStop.status}`,
  );
  await waitForState(base, cookie, 'stopped', 120_000);
  const cycledStart = await postJson(base, cookie, '/api/computer/start', { authorize: true });
  check(
    'cycle-start-accepted',
    cycledStart.status === 200 && cycledStart.body?.ok === true,
    `HTTP ${cycledStart.status}`,
  );
  await waitForState(base, cookie, 'running', 300_000);

  let browsers = 0;
  const browserDeadline = Date.now() + 90_000;
  while (Date.now() < browserDeadline) {
    browsers = countBrowsers(options.container);
    if (browsers > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  check('browser-open-before-export', browsers > 0, `browser processes=${browsers}`);

  seedMarkers(options.container);
  const hashBefore = hashVolumeFiles(options.container);
  const missingBefore = hashBefore
    .split('\n')
    .filter((line) => line.startsWith('MISSING'))
    .map((line) => line.replace(/^MISSING\s+/, ''));
  const allowedMissing = missingBefore.every((path) => path === '/config/.bashrc');
  check(
    'markers-hashed',
    hashBefore.includes('tb154-marker.txt') && allowedMissing,
    `${hashBefore.split('\n').length} entries (missing=${missingBefore.join('|') || 'none'})`,
  );

  const watchStop = { done: false };
  const watch = watchPhases(base, cookie, watchStop, phases);
  const exportStartedAt = Date.now();
  const exported = await postJson(
    base,
    cookie,
    '/api/computer/export',
    { authorize: true, dir: options.exportDir },
    300_000,
  );
  timings.exportMs = Date.now() - exportStartedAt;
  watchStop.done = true;
  await watch;
  check(
    'export-accepted',
    exported.status === 200 &&
      exported.body?.ok === true &&
      typeof exported.body?.archive === 'string',
    `HTTP ${exported.status} ${exported.body?.error ?? ''}`,
  );

  const seenPhases = new Set(phases.map((sample) => sample.phase).filter(Boolean));
  check(
    'export-shows-stopping-and-exporting',
    seenPhases.has('stopping') && seenPhases.has('exporting'),
    `phases=${[...seenPhases].join(',') || '(none observed)'}`,
  );

  let archiveSize = 0;
  if (typeof exported.body?.archive === 'string') {
    archiveSize = statSync(exported.body.archive).size;
  }
  check('archive-exists-nonempty', archiveSize > 0, `${archiveSize} bytes`);

  await waitForState(base, cookie, 'running', 120_000);
  check('restarts-after-export', true, '');

  const listed = await fetch(`${base}/api/computer/exports`, {
    signal: AbortSignal.timeout(15_000),
    headers: { cookie },
  });
  const files = JSON.parse(await listed.text())?.files ?? [];
  const archiveName =
    typeof exported.body?.archive === 'string' ? basename(exported.body.archive) : '';
  check('archive-listed', files.includes(archiveName), `${files.length} files`);

  const stopped = await postJson(base, cookie, '/api/computer/stop', { authorize: true });
  check(
    'stop-accepted',
    stopped.status === 200 && stopped.body?.ok === true,
    `HTTP ${stopped.status}`,
  );
  await waitForState(base, cookie, 'stopped', 120_000);
  check('reaches-stopped', true, '');

  const rm = docker(['rm', '-f', options.container]);
  check('container-removed', rm.status === 0, rm.stderr.trim().split('\n').pop() ?? '');
  const volRm = docker(['volume', 'rm', options.volume]);
  check('volume-removed', volRm.status === 0, volRm.stderr.trim().split('\n').pop() ?? '');

  const importStartedAt = Date.now();
  const imported = await postJson(
    base,
    cookie,
    '/api/computer/import',
    { authorize: true, file: archiveName },
    300_000,
  );
  timings.importMs = Date.now() - importStartedAt;
  check(
    'import-accepted',
    imported.status === 200 && imported.body?.ok === true,
    `HTTP ${imported.status} ${imported.body?.error ?? ''}`,
  );
  await waitForState(base, cookie, 'running', 300_000);
  check('running-after-import', true, '');

  const hashAfter = hashVolumeFiles(options.container);
  check('hashes-match-after-import', hashAfter === hashBefore, '');
  check(
    'workspace-restored',
    dockerExec(options.container, 'test -d /config/workspace && echo ok').includes('ok'),
    '',
  );

  const diagnostics = await fetch(`${base}/api/computer/diagnostics`, {
    signal: AbortSignal.timeout(15_000),
    headers: { cookie },
  });
  const events = JSON.parse(await diagnostics.text())?.events ?? [];

  const failed = checks.filter((entry) => !entry.ok);
  const report = {
    ok: failed.length === 0,
    checks,
    timings: { ...timings, archiveBytes: archiveSize },
    phases,
    archive: exported.body?.archive ?? null,
    hashBefore,
    hashAfter,
    diagnostics: events.slice(-30),
  };
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `export=${timings.exportMs ?? '?'}ms import=${timings.importMs ?? '?'}ms archive=${archiveSize}B`,
    );
    console.log(`${failed.length === 0 ? 'PASS' : 'FAIL'} round-trip (${checks.length} checks)`);
  }
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`probe failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
