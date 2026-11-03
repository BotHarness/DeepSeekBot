import type { HumanAttentionItem } from './wire';

export interface LocalApprovalAlert {
  title: string;
  body: string;
  data: {
    v: 1;
    hostId: string;
    itemId: string;
    kind: 'tool-approval';
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
}

export interface DeviceAlertPort {
  reconcile(snapshot: AlertSnapshot): Promise<void>;
  forget(hostId: string): Promise<void>;
  syncHosts?(
    hosts: string[],
    approvalsEnabled: boolean,
    hostPreferences: Record<string, boolean>,
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
}

interface DeviceAlertSource {
  ready: Promise<void>;
  read(): { hosts: DeviceAlertInput[]; approvalsEnabled: boolean };
  failed(): void;
}

export function createDeviceAlerts(port: DeviceAlertPort, source?: DeviceAlertSource) {
  const removed = new Set<string>();
  const applied = new Map<string, string>();
  const hostEnabled = new Map<string, boolean>();
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
    syncHosts(hosts: string[], approvalsEnabled: boolean): Promise<void> {
      return serialize(async () => {
        const paired = hosts.filter((id) => !removed.has(id));
        const preferences = Object.fromEntries(
          paired.flatMap((id) => {
            const enabled = hostEnabled.get(id);
            return enabled === undefined ? [] : [[id, enabled]];
          }),
        );
        const key = JSON.stringify([paired, approvalsEnabled, preferences]);
        if (key === policyApplied) return;
        await port.syncHosts?.(paired, approvalsEnabled, preferences);
        policyApplied = key;
      });
    },
    invalidate(): void {
      applied.clear();
    },
    async update(input: DeviceAlertInput): Promise<void> {
      if (!input.connected || input.items === undefined) return;
      const pending = input.items.filter(
        (item) => item.kind === 'tool-approval' && item.category === 'action',
      );
      const snapshot: AlertSnapshot = {
        hostId: input.hostId,
        pending: pending.map((item) => item.id),
        alerts: pending.flatMap((item): LocalApprovalAlert[] => {
          if (input.foreground || !input.approvalsEnabled) return [];
          if (!item.channelId || !item.messageId) return [];
          const sender = input.botName(item.botSlug) ?? item.botSlug;
          return [
            {
              title: sender,
              body: input.approvalText,
              data: {
                v: 1,
                hostId: input.hostId,
                itemId: item.id,
                kind: 'tool-approval',
                botSlug: item.botSlug,
                channelId: item.channelId,
                messageId: item.messageId,
                sender,
                text: input.approvalText,
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
        applied.set(input.hostId, key);
      });
    },
    forget(hostId: string): Promise<void> {
      removed.add(hostId);
      applied.delete(hostId);
      hostEnabled.delete(hostId);
      policyApplied = undefined;
      return serialize(() => port.forget(hostId));
    },
  };
  return owner;
}
