import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { BridgeActions } from './actions.js';
import { mountActivityLive } from './activity-live.js';
import { loadActivitySnapshot, loadJournalPage, type BridgeCall } from './bridge.js';
import { installChannelFollow, mountChannelLive, mountRosterLive } from './channel-live.js';
import { reportFailure } from './diagnostic-log.js';
import {
  CHANNEL_REMOTE_DESCRIPTOR,
  COMPANION_REMOTE_DESCRIPTOR,
  createChannelFollow,
  createCompanionSource,
  type CompanionNamespace,
  type CompanionSource,
  createTypedLive,
  SNAPSHOT_REMOTE_DESCRIPTORS,
  type ChannelNamespace,
  type SnapshotNamespace,
} from './live-snapshots.js';
import { installTypedLive } from './messaging-defaults-live.js';
import { store } from './store.js';

export function mountClientLive(
  ctx: ClientContext,
  {
    actions,
    call,
    setCompanionSource,
  }: {
    actions: BridgeActions;
    call: BridgeCall;
    setCompanionSource(source: ((url: string) => CompanionSource) | undefined): void;
  },
): void {
  ctx.effect(
    () => (typeof EventSource === 'undefined' ? () => {} : mountChannelLive(store, actions)),
    'botharness: Channel live subscription',
  );
  ctx.effect(
    () => (typeof EventSource === 'undefined' ? () => {} : mountRosterLive(store, actions)),
    'botharness: Roster live subscription',
  );
  ctx.effect(() => {
    let uninstall: (() => void) | undefined;
    let disposed = false;
    const native = ctx.remote as Partial<Pick<typeof ctx.remote, '$mount' | '$stream'>>;
    if (typeof native.$mount !== 'function' || typeof native.$stream !== 'function')
      return () => {};
    const namespace = (): Partial<SnapshotNamespace> => {
      const mounted = ctx.get('remote.botharness') as Partial<SnapshotNamespace> | undefined;
      if (mounted === undefined) throw new Error('botharness live Remote is not mounted');
      return mounted;
    };
    void ctx.remote
      .$mount({
        package: '@botharness/core',
        descriptors: [
          ...SNAPSHOT_REMOTE_DESCRIPTORS,
          CHANNEL_REMOTE_DESCRIPTOR,
          COMPANION_REMOTE_DESCRIPTOR,
        ],
      })
      .then(
        () => {
          if (disposed) return;
          const uninstallTyped = installTypedLive(
            createTypedLive(ctx.remote, () => {
              const mounted = namespace();
              if (mounted.followRoster === undefined || mounted.followActivity === undefined)
                throw new Error('botharness live Remote is not mounted');
              return mounted as SnapshotNamespace;
            }),
          );
          const uninstallFollow = installChannelFollow(
            createChannelFollow(
              ctx.remote,
              () => {
                const mounted = namespace() as Partial<ChannelNamespace>;
                if (mounted.followChannel === undefined)
                  throw new Error('botharness live Remote is not mounted');
                return mounted as ChannelNamespace;
              },
              (channelId, request, signal) => loadJournalPage(call, channelId, request, signal),
            ),
          );
          setCompanionSource(
            createCompanionSource(ctx.remote, () => {
              const mounted = namespace() as Partial<CompanionNamespace>;
              if (mounted.followCompanion === undefined)
                throw new Error('botharness live Remote is not mounted');
              return mounted as CompanionNamespace;
            }),
          );
          uninstall = () => {
            setCompanionSource(undefined);
            uninstallFollow();
            uninstallTyped();
          };
        },
        (error: unknown) => {
          reportFailure('live-remote-stream-unavailable', 'live Remote stream unavailable', error);
        },
      );
    return () => {
      disposed = true;
      uninstall?.();
    };
  }, 'botharness: live streams on the native Remote stream carrier');
  ctx.effect(
    () => mountActivityLive(store, undefined, (signal) => loadActivitySnapshot(call, signal)),
    'botharness: PersonaBot activity subscription',
  );
}
