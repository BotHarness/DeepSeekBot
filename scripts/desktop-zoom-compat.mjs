import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const ZOOM_THEME_VERSION = '0.2.1-rc.2';
export const ZOOM_THEME_HASHES = {
  client: 'f9915fb53d5f156e75291e63be66c80e607a82bfd03c7d583e0a12ebef5a6cb8',
  host: '1adf59906ab10e91765d96f3e42268b0b7669f921c4baf4021a3057894cf3000',
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
export function adaptZoomTheme(client) {
  if (hash(client) !== ZOOM_THEME_HASHES.client) throw Error('zoom-theme-build-unsupported');
  const call =
    '\t\t\t\tinstallFontSizeShortcuts(ctx, (delta) => {\n\t\t\t\t\tthis.adjustFontSizes(delta);\n\t\t\t\t});';
  const start = 'function installFontSizeShortcuts(ctx, adjust) {\n\t\t\tctx.inject(';
  if (client.split(call).length !== 2 || client.split(start).length !== 2)
    throw Error('zoom-theme-shape-unsupported');
  const adapter = `

        const installFontKeys = () => installFontSizeShortcuts(ctx, delta => this.adjustFontSizes(delta));
        let fontKeys = installFontKeys();
        if (location.protocol === 'dsh-app:' && location.hostname === 'app' && ['darwin', 'win32'].includes(document.documentElement.dataset.platform)) {
          let alive = true, held = false;
          const compatibility = {
            version: 1, desktopVersion: window.__DSH_BOOT__?.release?.version,
            platform: document.documentElement.dataset.platform === 'win32' ? 'windows' : 'macos',
            async acquire() {
              if (!alive || held) throw Error('zoom-compatibility-unavailable');
              held = true;
              try { await fontKeys.dispose(); }
              catch (error) { held = false; throw error; }
              if (!alive) { held = false; throw Error('zoom-compatibility-disposed'); }
              let released = false;
              return () => {
                if (released) return;
                released = true; held = false;
                if (alive) fontKeys = installFontKeys();
              };
            }
          };
          if (window.__botharnessWindowZoomCompatibility) throw Error('zoom-compatibility-duplicate');
          window.__botharnessWindowZoomCompatibility = compatibility;
          ctx.effect(() => () => {
            alive = false;
            if (window.__botharnessWindowZoomCompatibility === compatibility) delete window.__botharnessWindowZoomCompatibility;
          }, 'botharness: desktop zoom compatibility ownership');
        }`;
  return client
    .replace(call, adapter)
    .replace(start, 'function installFontSizeShortcuts(ctx, adjust) {\n\t\t\treturn ctx.inject(');
}
function transformZoomTheme(source, { packaged = false, schemaModule } = {}) {
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  const supported =
    manifest.name === '@deepseek-ai/dsh-client-ui-theme' &&
    typeof manifest.version === 'string' &&
    manifest.license === 'MIT';
  if (!packaged && !supported) throw Error('zoom-theme-version-unsupported');
  const client = readFileSync(join(source, 'lib/client.js'), 'utf8');
  const host = readFileSync(join(source, 'lib/index.js'), 'utf8');
  if (packaged && (!supported || hash(host) !== ZOOM_THEME_HASHES.host))
    throw Error('zoom-theme-version-unsupported');
  const adapted = adaptZoomTheme(client);
  if (!packaged && hash(host) !== ZOOM_THEME_HASHES.host)
    throw Error('zoom-theme-host-unsupported');
  let schemaSpecifier = '"../../dist/theme-schema.mjs"';
  if (!packaged) {
    const schema =
      schemaModule ??
      join(
        dirname(createRequire(join(source, 'package.json')).resolve('@deepseek-ai/schemastery')),
        'index.mjs',
      );
    if (!existsSync(schema) || !existsSync(join(source, 'LICENSE')))
      throw Error('zoom-theme-dependency-unavailable');
    schemaSpecifier = JSON.stringify(pathToFileURL(schema).href);
  }
  const specifier = '"@deepseek-ai/schemastery"';
  if (host.split(specifier).length !== 2) throw Error('zoom-theme-host-shape-unsupported');
  return {
    manifest,
    client: adapted,
    host: host.replace(specifier, schemaSpecifier),
    provenance: {
      adapterVersion: 1,
      sourceVersion: manifest.version,
      clientBefore: hash(client),
      clientAfter: hash(adapted),
      hostBefore: hash(host),
      sourceModified: false,
      platforms: ['macos', 'windows'],
      changes: [
        'lease-owned font shortcut handoff',
        packaged ? 'portable product-owned schema module' : 'canonical schema module import',
      ],
    },
  };
}
export function prepareDesktopZoomCompatibility({ source, target, schemaModule }) {
  source = realpathSync(source);
  target = resolve(target);
  const path = relative(source, target);
  if (!(path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) || existsSync(target))
    throw Error('zoom-target-must-be-new');
  const theme = transformZoomTheme(source, { schemaModule });
  cpSync(source, target, {
    recursive: true,
    filter: (path) => !relative(source, path).split(/[\\/]/).includes('node_modules'),
  });
  writeFileSync(join(target, 'lib/client.js'), theme.client);
  writeFileSync(join(target, 'lib/index.js'), theme.host);
  writeFileSync(
    join(target, 'botharness-zoom-compat.json'),
    JSON.stringify(theme.provenance, null, 2),
  );
  return theme.provenance;
}
export function preparePackagedDesktopZoomTheme({ source, target }) {
  source = realpathSync(source);
  target = resolve(target);
  let ancestor = target;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  target = resolve(realpathSync(ancestor), relative(ancestor, target));
  const outside = (path) => path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path);
  if (!outside(relative(source, target)) || !outside(relative(target, source)))
    throw Error('zoom-target-inside-source');
  const theme = transformZoomTheme(source, { packaged: true });
  mkdirSync(join(target, 'lib'), { recursive: true });
  const save = (path, value) => {
    if (existsSync(path) && readFileSync(path, 'utf8') === value) return;
    writeFileSync(path, value);
  };
  for (const directory of ['lib/styles', 'lib/types', 'locale'])
    cpSync(join(source, directory), join(target, directory), {
      recursive: true,
      filter: (path) => {
        const destination = join(target, relative(source, path));
        return (
          !statSync(path).isFile() ||
          !existsSync(destination) ||
          !readFileSync(path).equals(readFileSync(destination))
        );
      },
    });
  save(join(target, 'LICENSE'), readFileSync(join(source, 'LICENSE'), 'utf8'));
  save(join(target, 'package.json'), JSON.stringify(theme.manifest, null, 2) + '\n');
  save(join(target, 'lib/client.js'), theme.client);
  save(join(target, 'lib/index.js'), theme.host);
  save(
    join(target, 'botharness-zoom-compat.json'),
    JSON.stringify(theme.provenance, null, 2) + '\n',
  );
  return theme.provenance;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, target] = process.argv.slice(2);
  if (!source || !target || process.argv.length !== 4)
    throw Error(
      'Usage: node scripts/desktop-zoom-compat.mjs <source-theme-package> <new-output-directory>',
    );
  process.stdout.write(JSON.stringify(prepareDesktopZoomCompatibility({ source, target })) + '\n');
}
