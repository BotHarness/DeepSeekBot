const path = require('node:path');

module.exports = function withWebPreview(config) {
  const resolve = config.resolver.resolveRequest;
  const overrides = new Map([
    [
      path.resolve(__dirname, '../../src/ui/native-interface-preferences.ts'),
      path.resolve(__dirname, 'interface-preferences.ts'),
    ],
    [
      path.resolve(__dirname, '../../src/ui/primitives/system-symbol.tsx'),
      path.resolve(__dirname, 'system-symbol.tsx'),
    ],
  ]);
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolved = resolve(context, moduleName, platform);
    if (platform !== 'web' || resolved.type !== 'sourceFile') return resolved;
    const filePath = overrides.get(resolved.filePath);
    return filePath === undefined ? resolved : { ...resolved, filePath };
  };
  return config;
};
