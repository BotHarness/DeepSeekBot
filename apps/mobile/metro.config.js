const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
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
