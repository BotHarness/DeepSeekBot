import { createDeviceNotificationPreferences } from '../../src/host/device-notification-preferences';
import { nativeCarrier } from '../../src/host/native-carrier';
import { createHostPush } from '../../src/host/push';

const key = 'deepseekbot.notification-preferences.v1';

export const notificationPreferences = createDeviceNotificationPreferences({
  storage: {
    async read() {
      const saved = localStorage.getItem(key);
      return saved === null ? undefined : (JSON.parse(saved) as unknown);
    },
    write(preferences) {
      localStorage.setItem(key, JSON.stringify(preferences));
    },
  },
  push: createHostPush(nativeCarrier()),
});
