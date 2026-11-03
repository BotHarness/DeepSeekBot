import type { HumanAttentionItem } from './wire';
import type { PushKind, PushPreferences } from './push';

const kinds: Record<string, PushKind> = {
  'tool-approval': 'approval',
  'workspace-grant-request': 'approval',
  'auto-rejection': 'approval',
  'group-join-request': 'approval',
  'user-question': 'question',
  'assignment-waiting-human': 'question',
  'assignment-blocked': 'question',
  'private-input': 'private-input',
  'channel-reply': 'reply',
  'channel-mention': 'reply',
};

export interface LocalApprovalAlert {
  title: string;
  body: string;
  data: {
    v: 1;
    hostId: string;
    itemId: string;
    kind: string;
    botSlug: string;
    channelId: string;
    messageId: string;
    sender: string;
    text: string;
  };
}

export interface AlertSnapshot {
  hostId: string;
  pending: string[];
  alerts: LocalApprovalAlert[];
  foreground?: boolean;
  silent?: string[];
  preferences?: PushPreferences;
  quietChannelIds?: readonly string[];
}

export interface DeviceAlertPort {
  reconcile(snapshot: AlertSnapshot): Promise<void>;
  forget(hostId: string): Promise<void>;
  syncHosts?(
    hosts: string[],
    approvalsEnabled: boolean,
    hostPreferences: Record<string, boolean>,
    kinds?: PushPreferences,
  ): Promise<void>;
}

export interface DeviceAlertInput {
  hostId: string;
  connected: boolean;
  items: readonly HumanAttentionItem[] | undefined;
  foreground: boolean;
  approvalsEnabled: boolean;
  botName(slug: string): string | undefined;
  approvalText: string;
  preferences?: PushPreferences;
  quietChannelIds?: readonly string[];
  visibleChannelId?: string | undefined;
  text?: Record<PushKind, string>;
}

interface DeviceAlertSource {
  ready: Promise<void>;
  read(): { hosts: DeviceAlertInput[]; approvalsEnabled: boolean; preferences?: PushPreferences };
  failed(): void;
}

export function createDeviceAlerts(port: DeviceAlertPort, source?: DeviceAlertSource) {
  const removed = new Set<string>();
  const applied = new Map<string, string>();
  const hostEnabled = new Map<string, boolean>();
  const baselined = new Set<string>();
  let policyApplied: string | undefined;
  let pending = false;
  let refreshing = false;
  let mutation: Promise<void> = Promise.resolve();
  const serialize = (work: () => Promise<void>) => {
    const next = mutation.then(work);
    mutation = next.catch(() => {});
    return next;
  };
  const owner = {
    refresh(): void {
      if (!source) return;
      pending = true;
      if (refreshing) return;
      refreshing = true;
      void (async () => {
        try {
          await source.ready;
          while (pending) {
            pending = false;
            const snapshot = source.read();
            const hosts = snapshot.hosts.filter((host) => !removed.has(host.hostId));
            await owner.syncHosts(
              hosts.map((host) => host.hostId),
              snapshot.approvalsEnabled,
              snapshot.preferences,
            );
            for (const host of hosts)
              await owner.update({
                ...host,
                approvalsEnabled: host.approvalsEnabled && hostEnabled.get(host.hostId) === true,
              });
          }
        } finally {
          refreshing = false;
        }
      })().catch(() => source.failed());
    },
    paired(hostId: string): void {
      removed.delete(hostId);
      applied.delete(hostId);
    },
    includes(hostId: string): boolean {
      return !removed.has(hostId);
    },
    setHostEnabled(hostId: string, enabled: boolean): void {
      hostEnabled.set(hostId, enabled);
    },
    hostEnabled(hostId: string): boolean {
      return hostEnabled.get(hostId) === true;
    },
    syncHosts(hosts: string[], approvalsEnabled: boolean, kinds?: PushPreferences): Promise<void> {
      return serialize(async () => {
        const paired = hosts.filter((id) => !removed.has(id));
        const preferences = Object.fromEntries(
          paired.flatMap((id) => {
            const enabled = hostEnabled.get(id);
            return enabled === undefined ? [] : [[id, enabled]];
          }),
        );
        const key = JSON.stringify([paired, approvalsEnabled, preferences, kinds]);
        if (key === policyApplied) return;
        await port.syncHosts?.(paired, approvalsEnabled, preferences, kinds);
        policyApplied = key;
      });
    },
    invalidate(): void {
      applied.clear();
    },
    async update(input: DeviceAlertInput): Promise<void> {
      if (!input.connected || input.items === undefined) return;
      const pending = input.items.filter((item) => kinds[item.kind] !== undefined);
      const extended = input.preferences !== undefined;
      const silent: string[] = [];
      const snapshot: AlertSnapshot = {
        hostId: input.hostId,
        pending: pending.map((item) => item.id),
        ...(extended
          ? {
              foreground: input.foreground,
              preferences: input.preferences,
              quietChannelIds: input.quietChannelIds ?? [],
              silent,
            }
          : {}),
        alerts: pending.flatMap((item): LocalApprovalAlert[] => {
          const kind = kinds[item.kind]!;
          if (!input.approvalsEnabled || (!extended && input.foreground)) return [];
          if (input.preferences?.[kind] === false) return [];
          if (kind === 'reply' && item.channelId && input.quietChannelIds?.includes(item.channelId))
            return [];
          if (
            kind === 'reply' &&
            (!baselined.has(input.hostId) ||
              (input.foreground && input.visibleChannelId === item.channelId))
          ) {
            silent.push(item.id);
            return [];
          }
          if (!extended && (!item.channelId || !item.messageId)) return [];
          const sender = input.botName(item.botSlug) ?? item.botSlug;
          const preview = item.summary.replace(/\s+/gu, ' ').trim();
          const body =
            kind === 'private-input'
              ? (input.text?.[kind] ?? '')
              : kind === 'reply'
                ? preview.length <= 140
                  ? preview
                  : `${preview.slice(0, 139).trimEnd()}…`
                : (input.text?.[kind] ?? input.approvalText);
          return [
            {
              title:
                item.channelName && item.channelId !== `dm:${item.botSlug}`
                  ? `#${item.channelName}`
                  : sender,
              body,
              data: {
                v: 1,
                hostId: input.hostId,
                itemId: item.id,
                kind: item.kind,
                botSlug: item.botSlug,
                channelId: item.channelId ?? '',
                messageId: item.messageId ?? '',
                sender,
                text: body,
              },
            },
          ];
        }),
      };
      await serialize(async () => {
        if (removed.has(input.hostId)) return;
        const key = JSON.stringify(snapshot);
        if (applied.get(input.hostId) === key) return;
        await port.reconcile(snapshot);
        baselined.add(input.hostId);
        applied.set(input.hostId, key);
      });
    },
    forget(hostId: string): Promise<void> {
      removed.add(hostId);
      applied.delete(hostId);
      hostEnabled.delete(hostId);
      baselined.delete(hostId);
      policyApplied = undefined;
      return serialize(() => port.forget(hostId));
    },
  };
  return owner;
}
