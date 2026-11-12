import { requireOptionalNativeModule } from 'expo';
import * as Notifications from 'expo-notifications';

interface CallNoticeAccess {
  callNotificationsAllowed(): boolean;
  callOverlayAllowed(): boolean;
  callOverlaySettings(): Promise<boolean>;
}

const native = requireOptionalNativeModule<CallNoticeAccess>('LocalComputerVideo');
const module =
  native !== null && typeof (native as Partial<CallNoticeAccess>).callOverlayAllowed === 'function'
    ? native
    : undefined;

export async function askCallNotifications(): Promise<boolean | undefined> {
  if (module === undefined) return undefined;
  if (module.callNotificationsAllowed()) return true;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
  } catch {}
  return module.callNotificationsAllowed();
}

export function callOverlayAllowed(): boolean | undefined {
  return module?.callOverlayAllowed();
}

export async function openCallOverlaySettings(): Promise<void> {
  await module?.callOverlaySettings();
}
