import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
export const DEFAULT_CAS = join(
  homedir(),
  'Library/Developer/Xcode/DerivedData/CompilationCache.noindex',
);
export const DEFAULT_CAS_MAX_GB = 25;
const SIMULATOR = 'generic/platform=iOS Simulator';

const USAGE = `Usage: node scripts/ios-build.mjs [options] [-- <xcodebuild settings>]

  --configuration <Debug|Release>  Build configuration (default Debug)
  --destination <spec>             xcodebuild destination (default "${SIMULATOR}")
  --prebuild                       Regenerate apps/mobile/ios first (expo prebuild + pod install)
  --keep-derived-data              Keep this worktree's DerivedData after the build
  --no-cache                       Build without the shared compilation cache
  --help                           Show this help

The .app is copied to apps/mobile/ios/build/ and its path is printed as JSON.`;

export function parseArgs(argv) {
  const options = {
    configuration: 'Debug',
    destination: SIMULATOR,
    prebuild: false,
    keepDerivedData: false,
    cache: true,
    help: false,
    extra: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--') {
      options.extra = argv.slice(index + 1);
      break;
    }
    if (flag === '--prebuild') options.prebuild = true;
    else if (flag === '--keep-derived-data') options.keepDerivedData = true;
    else if (flag === '--no-cache') options.cache = false;
    else if (flag === '--help' || flag === '-h') options.help = true;
    else if (flag === '--configuration' || flag === '--destination') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
      options[flag.slice(2)] = value;
      index += 1;
    } else throw new Error(`unknown flag ${flag}`);
  }
  if (!['Debug', 'Release'].includes(options.configuration))
    throw new Error('--configuration must be Debug or Release');
  return options;
}

export function cacheSettings(worktree, cas) {
  return [
    'COMPILATION_CACHE_ENABLE_CACHING=YES',
    `COMPILATION_CACHE_CAS_PATH=${cas}`,
    'COMPILATION_CACHE_ENABLE_DIAGNOSTIC_REMARKS=YES',
    'SWIFT_ENABLE_PREFIX_MAPPING=YES',
    'SWIFT_ENABLE_PROJECT_PREFIX_MAPPING=YES',
    'CLANG_ENABLE_PREFIX_MAPPING=YES',
    'CLANG_ENABLE_PROJECT_PREFIX_MAPPING=YES',
    `SWIFT_OTHER_PREFIX_MAPPINGS=${worktree}=/^wt`,
    `CLANG_OTHER_PREFIX_MAPPINGS=${worktree}=/^wt`,
  ];
}

export function xcodebuildArgs({
  workspace,
  scheme,
  derivedData,
  configuration,
  destination,
  worktree,
  cas,
  extra = [],
}) {
  return [
    'build',
    '-workspace',
    workspace,
    '-scheme',
    scheme,
    '-configuration',
    configuration,
    '-destination',
    destination,
    '-derivedDataPath',
    derivedData,
    'COMPILER_INDEX_STORE_ENABLE=NO',
    'INDEX_ENABLE_DATA_STORE=NO',
    ...(destination.includes('Simulator') ? ['CODE_SIGNING_ALLOWED=NO'] : []),
    ...(cas === undefined ? [] : cacheSettings(worktree, cas)),
    ...extra,
  ];
}

export function productsFolder(configuration, destination) {
  const sdk = destination.includes('Simulator') ? 'iphonesimulator' : 'iphoneos';
  return `${configuration}-${sdk}`;
}

export function cacheCounts(log) {
  return {
    hits: log.match(/^Cache hit$/gmu)?.length ?? 0,
    misses: log.match(/^Cache miss$/gmu)?.length ?? 0,
  };
}

export function casInUse(processList, cas) {
  return processList.split('\n').some((line) => line.includes('xcodebuild') && line.includes(cas));
}

function folderBytes(path) {
  const result = spawnSync('du', ['-sk', path], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  return result.status === 0 ? Number.parseInt(result.stdout, 10) * 1024 : 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
}

function trimCache(cas, maxGb) {
  if (!existsSync(cas)) return undefined;
  const bytes = folderBytes(cas);
  if (bytes <= maxGb * 1024 ** 3) return undefined;
  const processes = spawnSync('ps', ['-axo', 'command'], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  }).stdout;
  if (casInUse(processes ?? '', cas)) return 'over the limit, but another build is using it';
  rmSync(cas, { recursive: true, force: true });
  return `cleared at ${(bytes / 1024 ** 3).toFixed(1)} GB (limit ${maxGb} GB)`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const mobile = join(root, 'apps/mobile');
  const ios = join(mobile, 'ios');
  const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
  if (options.prebuild || !existsSync(ios)) {
    run('npx', ['expo', 'prebuild', '--platform', 'ios', '--no-install'], {
      cwd: mobile,
      env: { ...env, CI: '1' },
    });
    run('pod', ['install'], { cwd: ios, env });
  }
  const workspaceName = readdirSync(ios).find((name) => name.endsWith('.xcworkspace'));
  if (workspaceName === undefined) throw new Error(`no .xcworkspace in ${ios}; pass --prebuild`);
  const scheme = basename(workspaceName, '.xcworkspace');
  const output = join(ios, 'build');
  const derivedData = join(output, 'DerivedData');
  const cas = options.cache ? (process.env.BOTHARNESS_IOS_CAS ?? DEFAULT_CAS) : undefined;
  const maxGb = Number(process.env.BOTHARNESS_IOS_CAS_MAX_GB ?? DEFAULT_CAS_MAX_GB);
  const trimmed = cas === undefined ? undefined : trimCache(cas, maxGb);
  rmSync(derivedData, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });

  const logPath = join(output, 'xcodebuild.log');
  const args = xcodebuildArgs({
    workspace: join(ios, workspaceName),
    scheme,
    derivedData,
    configuration: options.configuration,
    destination: options.destination,
    worktree: root,
    cas,
    extra: options.extra,
  });
  const started = Date.now();
  const status = await new Promise((done, fail) => {
    const log = createWriteStream(logPath);
    const child = spawn('xcodebuild', args, {
      cwd: mobile,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('error', fail);
    child.on('close', (code) => log.end(() => done(code)));
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  const logText = readFileSync(logPath, 'utf8');
  if (status !== 0) {
    console.error(logText.split('\n').slice(-40).join('\n'));
    throw new Error(`xcodebuild failed after ${seconds}s; full log: ${logPath}`);
  }

  const products = join(
    derivedData,
    'Build/Products',
    productsFolder(options.configuration, options.destination),
  );
  const built = readdirSync(products).find((name) => name === `${scheme}.app`);
  if (built === undefined) throw new Error(`no ${scheme}.app in ${products}`);
  const app = join(output, built);
  rmSync(app, { recursive: true, force: true });
  cpSync(join(products, built), app, { recursive: true, verbatimSymlinks: true });
  if (!options.keepDerivedData) rmSync(derivedData, { recursive: true, force: true });

  console.log(
    JSON.stringify(
      {
        app,
        seconds,
        cache: cas === undefined ? 'off' : { path: cas, ...cacheCounts(logText), trimmed },
        derivedData: options.keepDerivedData ? derivedData : 'removed',
        log: logPath,
      },
      undefined,
      2,
    ),
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
