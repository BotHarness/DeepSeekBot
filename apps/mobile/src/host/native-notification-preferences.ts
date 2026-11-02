import { File, Paths } from 'expo-file-system';
import { createDeviceNotificationPreferences } from './device-notification-preferences';
import { nativeCarrier } from './native-carrier';
import { createHostPush } from './push';

const file = () => new File(Paths.document, 'deepseekbot-notification-preferences.json');
export const notificationPreferences = createDeviceNotificationPreferences({
  storage: {
    async read() {
      const saved = file();
      return saved.exists ? JSON.parse(await saved.text()) : undefined;
    },
    write(preferences) {
      file().writeSync(JSON.stringify(preferences));
    },
  },
  push: createHostPush(nativeCarrier()),
});
