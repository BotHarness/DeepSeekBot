module.exports = ({ config }) => {
  const store = process.env.DEEPSEEKBOT_APP_VARIANT === 'store';
  return {
    ...config,
    owner: 'deepseekbots-team',
    updates: { ...config.updates, enabled: false },
    extra: { ...config.extra, eas: { projectId: '40cf3888-5864-4238-9cfb-82e285d568f6' } },
    ...(store
      ? {
          name: 'DeepSeekBot',
          scheme: 'deepseekbot',
          ios: { ...config.ios, bundleIdentifier: 'app.deepseekbot.mobile' },
          android: { ...config.android, package: 'app.deepseekbot.mobile' },
        }
      : {}),
  };
};
