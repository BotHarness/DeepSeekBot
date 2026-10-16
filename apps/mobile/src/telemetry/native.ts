import { nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import { isDevice } from 'expo-device';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { locale } from '../ui/strings';
import { createMobileTelemetry } from './mobile-telemetry';
import { createPostHogSender } from './posthog-sender';
import { isUuid } from './schema';

const mode = process.env.EXPO_PUBLIC_MOBILE_TELEMETRY;
const qaRun = process.env.EXPO_PUBLIC_MOBILE_TELEMETRY_QA_RUN;
const token = process.env.EXPO_PUBLIC_MOBILE_POSTHOG_TOKEN;
const native = Platform.OS === 'ios' || Platform.OS === 'android';
const qa = mode === 'qa' && isUuid(qaRun);
const production =
  mode === 'production' &&
  !__DEV__ &&
  isDevice &&
  process.env.EXPO_PUBLIC_MOBILE_TELEMETRY_QUALIFIED === 'true';
const configured =
  native && typeof token === 'string' && token.startsWith('phc_') && (qa || production);
const transport = createPostHogSender({
  token: token ?? '',
  request: (url, init) => fetch(url, init),
});
const file = () => new File(Paths.document, 'deepseekbot-mobile-statistics.json');
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 3) | 8).toString(16);
  });
}
export const mobileTelemetry = createMobileTelemetry({
  collect: configured,
  context: {
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    app_version: nativeApplicationVersion ?? 'unknown',
    app_build: nativeBuildVersion ?? 'unknown',
    environment: production ? 'production' : __DEV__ ? 'development' : 'preview',
    language: locale === 'zh' ? 'zh' : 'en',
    ...(qa ? { qa_run_id: qaRun } : {}),
  },
  storage: {
    async read() {
      const current = file();
      return current.exists ? JSON.parse(await current.text()) : undefined;
    },
    write(value) {
      const current = file();
      if (!current.exists) current.create();
      current.write(JSON.stringify(value));
    },
  },
  sender: transport.send,
  resetSender: transport.clear,
  uuid,
  now: Date.now,
  monotonic: () => performance.now(),
});
