module.exports = ({ config }) => {
  const store = process.env.DEEPSEEKBOT_APP_VARIANT === 'store';
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
    ...(store
      ? {
          name: 'DeepSeekBot',
          scheme: 'deepseekbot',
          android: {
            ...config.android,
            package: 'app.deepseekbot.mobile',
            ...(process.env.GOOGLE_SERVICES_JSON
              ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
              : {}),
          },
        }
      : {}),
  };
};
