const path = require('node:path');
const fs = require('node:fs');

module.exports = function withWebPreview(config) {
  const resolve = config.resolver.resolveRequest;
  const route = path.resolve(__dirname, '../../app/qa/account-actions.tsx');
  const generatedRoute = path.resolve(__dirname, '../../../../.humanlayer/account-preview.tsx');
  if (process.env.BOTHARNESS_MOBILE_ACCOUNT_PREVIEW === '1') {
    fs.mkdirSync(path.dirname(generatedRoute), { recursive: true });
    const source = fs.readFileSync(route, 'utf8');
    const guard =
      'if (!__DEV__ || !Application.applicationId?.endsWith(\'.dev\')) return <Redirect href="/" />;';
    if (!source.includes(guard))
      throw new Error('Account fixture guard changed; review preview adapter');
    fs.writeFileSync(generatedRoute, source.replace(guard, ''));
  }
  const overrides = new Map([
    [
      path.resolve(__dirname, '../../src/host/native-notification-preferences.ts'),
      path.resolve(__dirname, 'notification-preferences.ts'),
    ],
    [
      path.resolve(__dirname, '../../src/host/native-host-look.ts'),
      path.resolve(__dirname, 'host-look.ts'),
    ],
    [
      path.resolve(__dirname, '../../src/ui/native-interface-preferences.ts'),
      path.resolve(__dirname, 'interface-preferences.ts'),
    ],
    [
      path.resolve(__dirname, '../../src/host/native-local-store.ts'),
      path.resolve(__dirname, 'local-store.ts'),
    ],
    [
      path.resolve(__dirname, '../../src/ui/primitives/system-symbol.tsx'),
      path.resolve(__dirname, 'system-symbol.tsx'),
    ],
  ]);
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'web' && context.originModulePath === generatedRoute)
      context = { ...context, originModulePath: route };
    if (
      platform === 'web' &&
      moduleName === 'expo-application' &&
      context.originModulePath === path.resolve(__dirname, '../../app/qa/account-actions.tsx')
    )
      return { type: 'sourceFile', filePath: path.resolve(__dirname, 'qa-application.ts') };
    if (platform === 'web' && moduleName === 'expo-secure-store')
      return { type: 'sourceFile', filePath: path.resolve(__dirname, 'secure-store.ts') };
    const resolved = resolve(context, moduleName, platform);
    if (platform !== 'web' || resolved.type !== 'sourceFile') return resolved;
    if (process.env.BOTHARNESS_MOBILE_ACCOUNT_PREVIEW === '1' && resolved.filePath === route)
      return { ...resolved, filePath: generatedRoute };
    const filePath = overrides.get(resolved.filePath);
    return filePath === undefined ? resolved : { ...resolved, filePath };
  };
  return config;
};
