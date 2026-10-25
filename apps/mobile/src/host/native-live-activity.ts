import { requireOptionalNativeModule } from 'expo';
import { applicationId } from 'expo-application';
import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { AppState, Platform } from 'react-native';
import type { LiveActivity } from 'expo-widgets';
import { useSyncExternalStore } from 'react';
import { hostSession, onHostRemoval } from './host-session';
import { nativeCarrier } from './native-carrier';
import { ActivityRequestFailed, createHostActivity } from './live-activity';
import { subscribeActivityHost } from './live-activity-routing';
import {
  createActivitySession,
  type ActivityDisplay,
  type NativeRequestActivity,
} from './live-activity-session';
import { locale } from '../ui/strings';

const supported = () =>
  Platform.OS === 'ios' && requireOptionalNativeModule('ExpoWidgets') !== null;
const factory = async () => (await import('../ui/widgets/request-activity')).requestActivity;
const adapt = (activity: LiveActivity<ActivityDisplay>): NativeRequestActivity => ({
  id: activity.getId(),
  onToken(listener) {
    const subscription = activity.addPushTokenListener((event) => listener(event.pushToken));
    return () => subscription.remove();
  },
  async token() {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        subscription.remove();
        reject(new ActivityRequestFailed('activity-token-unavailable'));
      }, 15_000);
      const finish = (token: string) => {
        clearTimeout(timer);
        subscription.remove();
        resolve(token);
      };
      const subscription = activity.addPushTokenListener((event) => finish(event.pushToken));
      void activity
        .getPushToken()
        .then((token) => {
          if (token) finish(token);
        })
        .catch(() => {
          clearTimeout(timer);
          subscription.remove();
          reject(new ActivityRequestFailed('activity-token-unavailable'));
        });
    });
  },
  end: () => activity.end('immediate'),
});
const file = () => new File(Paths.document, 'deepseekbot-request-activity.json');
export const requestActivitySession = createActivitySession({
  native: {
    supported,
    async start(content, url) {
      if (!supported()) throw new ActivityRequestFailed('activity-native-unavailable');
      try {
        return adapt((await factory()).start(content, url, new Date(Date.now() + 5 * 60_000)));
      } catch {
        throw new ActivityRequestFailed('activity-native-unavailable');
      }
    },
    async instances() {
      return supported() ? (await factory()).getInstances().map(adapt) : [];
    },
  },
  remote: createHostActivity(nativeCarrier()),
  storage: {
    async read() {
      const saved = file();
      return saved.exists ? JSON.parse(await saved.text()) : undefined;
    },
    async write(value) {
      file().writeSync(JSON.stringify(value));
    },
  },
  host: (id) => hostSession.getState().hosts.find((host) => host.hostId === id),
  currentHostId: () => {
    const saved = hostSession.getState().saved;
    return saved === undefined ? undefined : (saved?.hostId ?? '');
  },
  selectionRevision: () => hostSession.getSelectionRevision(),
  sourceAvailable: (id) => {
    const source = hostSession.getHost(id);
    return source !== undefined && source.client.getSnapshot().connection.status !== 'refused';
  },
  bundleIdentifier: applicationId ?? '',
  locale: () => (locale === 'zh' ? 'zh' : 'en'),
  url: (id) =>
    `${applicationId === 'app.deepseekbot.mobile' ? 'deepseekbot' : 'deepseekbot-dev'}://request-activity?id=${encodeURIComponent(id)}`,
  id: randomUUID,
});
export const useRequestActivity = () =>
  useSyncExternalStore(requestActivitySession.subscribe, requestActivitySession.getSnapshot);

export function watchRequestActivity(): () => void {
  const sync = () => {
    void requestActivitySession.sync().catch(() => undefined);
  };
  const source = () => {
    const state = hostSession.getState();
    const target = requestActivitySession.getSnapshot().target;
    const host = target ? hostSession.getHost(target.hostId) : undefined;
    return {
      saved: state.saved === undefined ? undefined : (host?.saved ?? null),
      client: host?.client,
    };
  };
  let previousScope = '';
  const changed = () => {
    const state = hostSession.getState();
    const target = source();
    const scope = JSON.stringify([
      state.saved === undefined ? 'loading' : state.saved?.hostId,
      hostSession.getSelectionRevision(),
      target.saved?.hostId,
      target.saved?.deviceId,
      target.saved?.credential,
      target.saved?.encryption,
      target.client?.getSnapshot().connection.status,
    ]);
    if (scope === previousScope) return;
    previousScope = scope;
    sync();
  };
  const off = subscribeActivityHost(
    {
      getState: source,
      subscribe(listener) {
        const offHost = hostSession.subscribe(listener);
        const offActivity = requestActivitySession.subscribe(listener);
        return () => {
          offHost();
          offActivity();
        };
      },
    },
    changed,
  );
  const offRemoval = onHostRemoval((host) => requestActivitySession.forget(host));
  const subscription = AppState.addEventListener('change', (value) => {
    if (value === 'active') sync();
  });
  changed();
  return () => {
    off();
    offRemoval();
    subscription.remove();
  };
}
