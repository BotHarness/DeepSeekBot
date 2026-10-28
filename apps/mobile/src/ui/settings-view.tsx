import { useState, type ReactNode } from "react";

import type { ConnectionState } from "../host/client";
import type { OverviewUsage } from "../host/usage";
import { SHEET_GROUP } from "./chat/sheet";
import { space } from "./design/tokens";
import { View } from "react-native";
import { confirmDestructive } from "./primitives/app-dialog";
import { DrawerHeader } from "./primitives/drawer-header";
import { SettingsForm, SettingsFormItem } from "./primitives/settings-form";
import { SettingsRow, SettingsSection } from "./primitives/settings-row";
import { errorText, Notice } from "./request-parts";
import { UsageCard } from "./shell/usage-card";
import {
  AppearanceSetting,
  InterfaceSaveNotice,
  LanguageSetting,
} from "./interface-settings";
import { useStrings, t } from "./strings";

export interface SettingsActions {
  onUsage(): void;
  onComputers(): void;
  onAppIcon(): void;
  onNotifications(): void;
  onStorage(): void;
  onModels(): void;
  onUnpair(): Promise<void>;
  onCopyVersion(text: string): void;
}

const statusLabels = (): Record<ConnectionState["status"], string> => ({
  connected: t.connected,
  connecting: t.connecting,
  reconnecting: t.reconnecting,
  refused: t.refused,
  unreachable: t.unreachable,
  stopped: "",
});

export function SettingsView({
  hostName,
  connection,
  loadUsage,
  version,
  actions,
  statistics,
  messageDisplay,
  activityCount,
  chatBackground,
  hapticFeedback,
  deliveryReceipts,
}: {
  hostName: string | undefined;
  connection: ConnectionState;
  loadUsage?: (() => Promise<OverviewUsage>) | undefined;
  version: string;
  actions: SettingsActions;
  statistics?: ReactNode;
  messageDisplay?: ReactNode;
  activityCount?: ReactNode;
  chatBackground?: ReactNode;
  hapticFeedback?: ReactNode;
  deliveryReceipts?: ReactNode;
}) {
  const t = useStrings();
  const [unpairError, setUnpairError] = useState<string>();
  const [versionCopied, setVersionCopied] = useState(false);
  const status = [statusLabels()[connection.status], connection.route].filter(
    (part) => part !== "",
  );
  return (
    <SettingsForm>
      <SettingsFormItem>
        <UsageCard load={loadUsage} on={SHEET_GROUP} onOpen={actions.onUsage} />
      </SettingsFormItem>
      <SettingsSection title={t.modelSettings.title} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.modelSettings.title}
          icon="model"
          detail={t.modelSettings.global}
          disclosure
          onPress={actions.onModels}
        />
      </SettingsSection>
      <SettingsSection title={t.connections} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={hostName ?? "—"}
          detail={status.join(" · ")}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.computers}
          icon="computer"
          detail={t.computersHint}
          disclosure
          onPress={actions.onComputers}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.notifications}
          icon="notifications"
          disclosure
          onPress={actions.onNotifications}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.storage.title}
          icon="storage"
          detail={t.storage.hint}
          disclosure
          onPress={actions.onStorage}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.unpair}
          icon="unpair"
          iconTone="danger"
          tone="danger"
          onPress={() =>
            confirmDestructive(
              t.unpairHost(hostName ?? "—"),
              t.unpairHostDetail,
              t.unpair,
              () => {
                setUnpairError(undefined);
                actions
                  .onUnpair()
                  .catch((error: unknown) => setUnpairError(errorText(error)));
              },
            )
          }
        />
      </SettingsSection>
      {unpairError === undefined ? null : (
        <SettingsFormItem>
          <Notice tone="danger">{`${t.unpairFailed} ${unpairError}`}</Notice>
        </SettingsFormItem>
      )}
      <SettingsSection
        title={t.interface}
        on={SHEET_GROUP}
        footer={t.interfacePreferences.local}
      >
        <LanguageSetting on={SHEET_GROUP} />
        <AppearanceSetting on={SHEET_GROUP} />
        {messageDisplay}
        <SettingsRow
          on={SHEET_GROUP}
          title={t.appIcon}
          icon="appIcon"
          disclosure
          onPress={actions.onAppIcon}
        />
        {activityCount}
        {chatBackground}
        {hapticFeedback}
        {deliveryReceipts}
      </SettingsSection>
      <InterfaceSaveNotice />
      <SettingsSection title={t.about} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.appVersion}
          icon="version"
          detail={
            version === ""
              ? t.appVersionUnknown
              : versionCopied
                ? `${version} · ${t.copied}`
                : version
          }
          accessibilityLabel={`${t.appVersion}, ${version === "" ? t.appVersionUnknown : version}, ${t.copy}`}
          onPress={
            version === ""
              ? undefined
              : () => {
                  actions.onCopyVersion(version);
                  setVersionCopied(true);
                  setTimeout(() => setVersionCopied(false), 1500);
                }
          }
        />
      </SettingsSection>
      {statistics}
    </SettingsForm>
  );
}
