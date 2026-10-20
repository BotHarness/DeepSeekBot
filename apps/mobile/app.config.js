const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const mainCheckout = () => {
  try {
    const commonDir = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return path.dirname(commonDir);
  } catch {
    return path.resolve(__dirname, '../..');
  }
};

const googleServicesFile = () => {
  if (process.env.GOOGLE_SERVICES_JSON) return process.env.GOOGLE_SERVICES_JSON;
  const local = path.join(mainCheckout(), '.secrets', 'google-services.json');
  return existsSync(local) ? local : undefined;
};

module.exports = ({ config }) => {
  const store = process.env.DEEPSEEKBOT_APP_VARIANT === 'store';
  const firebase = googleServicesFile();
  return {
    ...config,
    owner: 'deepseekbots-team',
    updates: { ...config.updates, enabled: false },
    extra: { ...config.extra, eas: { projectId: '40cf3888-5864-4238-9cfb-82e285d568f6' } },
    ios: {
      ...config.ios,
      infoPlist: { ...config.ios.infoPlist, ITSAppUsesNonExemptEncryption: false },
      ...(store ? { bundleIdentifier: 'app.deepseekbot.mobile' } : {}),
    },
    android: {
      ...config.android,
      ...(store ? { package: 'app.deepseekbot.mobile' } : {}),
      ...(firebase ? { googleServicesFile: firebase } : {}),
    },
    ...(store ? { name: 'DeepSeekBot', scheme: 'deepseekbot' } : {}),
  };
};
