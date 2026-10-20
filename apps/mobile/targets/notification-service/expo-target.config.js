module.exports = (config) => ({
  type: 'notification-service',
  name: 'NotificationService',
  bundleIdentifier: '.notification-service',
  deploymentTarget: config.ios?.deploymentTarget ?? '16.4',
  frameworks: ['Intents', 'UserNotifications'],
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
