const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const withSharingPlugin = require('expo-sharing/app.plugin').default;

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

const sharing = {
  ios: {
    enabled: true,
    activationRule: {
      supportsText: true,
      supportsWebUrlWithMaxCount: 1,
      supportsImageWithMaxCount: 10,
      supportsMovieWithMaxCount: 10,
      supportsFileWithMaxCount: 10,
    },
  },
  android: {
    enabled: true,
    singleShareMimeTypes: ['text/*', 'image/*', 'video/*', 'audio/*', 'application/*'],
    multipleShareMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/*'],
  },
};

const withSharing = (resolved) => {
  const scheme = Array.isArray(resolved.scheme) ? resolved.scheme[0] : resolved.scheme;
  return { ...withSharingPlugin({ ...resolved, scheme }, sharing), scheme: resolved.scheme };
};

module.exports = ({ config }) => {
  const store = process.env.DEEPSEEKBOT_APP_VARIANT === 'store';
  const firebase = googleServicesFile();
  const bundleIdentifier = store ? 'app.deepseekbot.mobile' : config.ios.bundleIdentifier;
  return withSharing({
    ...config,
    owner: 'deepseekbots-team',
    updates: { ...config.updates, enabled: false },
    extra: { ...config.extra, eas: { projectId: '40cf3888-5864-4238-9cfb-82e285d568f6' } },
    ios: {
      ...config.ios,
      bundleIdentifier,
      infoPlist: {
        ...config.ios.infoPlist,
        ITSAppUsesNonExemptEncryption: false,
        NSUserActivityTypes: ['INSendMessageIntent'],
      },
      entitlements: {
        ...config.ios.entitlements,
        'com.apple.security.application-groups': [`group.${bundleIdentifier}`],
        'com.apple.developer.usernotifications.communication': true,
      },
    },
    android: {
      ...config.android,
      ...(store ? { package: 'app.deepseekbot.mobile' } : {}),
      ...(firebase ? { googleServicesFile: firebase } : {}),
    },
    ...(store ? { name: 'DeepSeekBot', scheme: ['deepseekbot', 'app.deepseekbot.mobile'] } : {}),
  });
};
