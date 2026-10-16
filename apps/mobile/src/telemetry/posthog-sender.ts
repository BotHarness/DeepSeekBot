import PostHog, { PostHogPersistedProperty } from 'posthog-react-native';
import { sanitizeEvent, type TelemetryEvent } from './schema';

const HOST = 'https://t.botharness.ai';
type FetchOptions = Parameters<PostHog['fetch']>[1];
type FetchResponse = Awaited<ReturnType<PostHog['fetch']>>;
export interface PostHogSenderOptions {
  token: string;
  request(url: string, options: FetchOptions): Promise<FetchResponse>;
}

export function createPostHogSender(options: PostHogSenderOptions) {
  let client: MobilePostHog | undefined;
  let approved = new Map<string, TelemetryEvent>();
  let signal: AbortSignal | undefined;
  let pending = false;
  class MobilePostHog extends PostHog {
    captureMobile(event: TelemetryEvent): void {
      this.captureStateless(event.distinct_id, event.event, event.properties, {
        uuid: event.uuid,
        timestamp: new Date(event.timestamp),
        disableGeoip: true,
      });
    }
    override fetch(url: string, init: FetchOptions): Promise<FetchResponse> {
      if (url !== `${HOST}/batch/` || signal === undefined || signal.aborted || approved.size === 0)
        return Promise.reject(new Error('Statistics transport closed'));
      const body = JSON.parse(String(init.body)) as { batch?: unknown[] };
      if (
        !Array.isArray(body.batch) ||
        body.batch.length !== approved.size ||
        new Set(body.batch.map((value) => (value as TelemetryEvent).uuid)).size !== approved.size ||
        body.batch.some((value) => {
          const safe = sanitizeEvent(value);
          return (
            safe === undefined ||
            Object.keys(value as object).length !== 5 ||
            Object.keys((value as TelemetryEvent).properties).length !==
              Object.keys(safe.properties).length ||
            JSON.stringify(safe) !== JSON.stringify(sanitizeEvent(approved.get(safe.uuid)))
          );
        })
      )
        return Promise.reject(new Error('Statistics payload refused'));
      return options.request(url, { ...init, signal });
    }
  }
  const getClient = () =>
    (client ??= new MobilePostHog(options.token, {
      host: HOST,
      persistence: 'memory',
      customAppProperties: {},
      defaultOptIn: false,
      personProfiles: 'never',
      setDefaultPersonProperties: false,
      captureAppLifecycleEvents: false,
      preloadFeatureFlags: false,
      disableRemoteFeatureFlags: true,
      disableRemoteConfig: true,
      disableSurveys: true,
      sendFeatureFlagEvent: false,
      enableSessionReplay: false,
      capturePushNotificationSubscriptions: false,
      capturePushNotificationOpened: false,
      errorTracking: { autocapture: false },
      logs: { beforeSend: () => null },
      disableGeoip: true,
      flushAt: 101,
      maxBatchSize: 100,
      maxQueueSize: 100,
      flushInterval: 0,
      fetchRetryCount: 0,
      requestTimeout: 8000,
      disableCompression: true,
      before_send: (event) => {
        const original = event.uuid === undefined ? undefined : approved.get(event.uuid);
        return original === undefined
          ? null
          : {
              uuid: original.uuid,
              event: original.event,
              timestamp: new Date(original.timestamp),
              properties: { ...original.properties },
            };
      },
    }));
  async function clear(): Promise<void> {
    signal = undefined;
    approved.clear();
    if (client !== undefined) {
      client.setPersistedProperty(PostHogPersistedProperty.Queue, null);
      client.reset();
      await client.optOut();
    }
  }
  return {
    async send(batch: readonly TelemetryEvent[], abort: AbortSignal): Promise<void> {
      if (abort.aborted || batch.length === 0) return;
      if (pending) throw new Error('Statistics sender busy');
      pending = true;
      approved = new Map(batch.map((event) => [event.uuid, event]));
      signal = abort;
      const sdk = getClient();
      try {
        await sdk.ready();
        if (abort.aborted) throw new Error('Statistics transport closed');
        await sdk.optIn();
        for (const event of batch) sdk.captureMobile(event);
        await sdk.flush();
      } finally {
        await clear();
        pending = false;
      }
    },
    clear,
  };
}
