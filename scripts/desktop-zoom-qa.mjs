import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

export function prepareDesktopZoomQa(root) {
  root = resolve(root);
  const profile = join(root, 'home/profiles/desktop');
  const manifestPath = join(profile, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const name = '@botharness/desktop-zoom-qa';
  const bundles = manifest.dsh?.profile?.bundles;
  if (!Array.isArray(bundles)) throw Error('zoom-qa-profile-bundles-unavailable');
  const target = join(root, 'cli-access');
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const tokenFile = join(root, 'cli-token');
  const infoFile = join(root, 'cli-access.json');
  writeFileSync(
    join(target, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '0.0.0',
        type: 'module',
        main: './index.mjs',
        dsh: { manifestVersion: 1, bundle: { patch: './cordis.patch.yml' } },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(target, 'cordis.patch.yml'),
    JSON.stringify([{ insert: [{ id: 'botharness-desktop-zoom-qa', name }] }]),
  );
  writeFileSync(
    join(target, 'index.mjs'),
    `import {writeFileSync,renameSync} from 'node:fs';
export const name = 'botharness-desktop-zoom-qa';
export const inject = ['webServer','connection'];
export function apply(ctx) {
  const origin = ctx.webServer.getOrigin();
  const base = new URL(origin);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1') throw Error('zoom-qa-requires-owned-loopback');
  const authenticated = new URL(ctx.connection.authenticatedUrl(origin));
  if (authenticated.origin !== base.origin) throw Error('zoom-qa-launch-origin-mismatch');
  const token = authenticated.searchParams.get('token');
  if (!token) throw Error('zoom-qa-launch-token-unavailable');
  const tokenFile = ${JSON.stringify(tokenFile)};
  const infoFile = ${JSON.stringify(infoFile)};
  const save = (path,value) => {
    const pending = path+'.'+process.pid+'.tmp';
    writeFileSync(pending,value,{mode:0o600,flag:'wx'});
    renameSync(pending,path);
  };
  save(tokenFile,token);
  save(infoFile,JSON.stringify({host:origin,tokenFile,hostPid:process.pid,desktopPid:process.ppid}));
}
`,
  );
  const link = join(profile, 'node_modules', name);
  mkdirSync(join(profile, 'node_modules/@botharness'), { recursive: true });
  if (existsSync(link)) {
    if (resolve(readlinkSync(link)) !== target) throw Error('zoom-qa-profile-link-conflict');
  } else symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  manifest.dependencies ??= {};
  manifest.dependencies[name] = `link:${target}`;
  if (!bundles.includes(name)) bundles.push(name);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return { infoFile, tokenFile };
}
