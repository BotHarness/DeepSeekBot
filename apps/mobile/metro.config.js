const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

function git(...args) {
  try {
    return execFileSync('git', args, {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
}
const commit = (
  process.env.BOTHARNESS_BUILD_SHA?.trim() ||
  git('rev-parse', 'HEAD') ||
  process.env.EAS_BUILD_GIT_COMMIT_HASH ||
  ''
).slice(0, 9);
if (commit !== '' && process.env.EXPO_PUBLIC_BUILD_COMMIT === undefined) {
  const dirty = git('status', '--porcelain', '--untracked-files=no') !== '';
  process.env.EXPO_PUBLIC_BUILD_COMMIT = dirty ? `${commit}-dirty` : commit;
}
if (process.env.EXPO_PUBLIC_BUILD_BRANCH === undefined) {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== '' && branch !== 'HEAD') process.env.EXPO_PUBLIC_BUILD_BRANCH = branch;
}
if (process.env.EXPO_PUBLIC_BUILD_TIME === undefined) {
  process.env.EXPO_PUBLIC_BUILD_TIME =
    process.env.BOTHARNESS_BUILD_TIME?.trim() || new Date().toISOString();
}

const config = getDefaultConfig(__dirname);
if (process.env.NODE_ENV === 'production') {
  config.cacheVersion = [
    config.cacheVersion,
    process.env.EXPO_PUBLIC_BUILD_COMMIT,
    process.env.EXPO_PUBLIC_BUILD_BRANCH,
    process.env.EXPO_PUBLIC_BUILD_TIME,
  ].join(':');
}
const packagesRoot = path.resolve(__dirname, '../../packages') + path.sep;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    context.originModulePath.startsWith(packagesRoot) &&
    moduleName.startsWith('.') &&
    moduleName.endsWith('.js')
  ) {
    try {
      return context.resolveRequest(context, moduleName.slice(0, -3) + '.ts', platform);
    } catch {
      return context.resolveRequest(context, moduleName, platform);
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
