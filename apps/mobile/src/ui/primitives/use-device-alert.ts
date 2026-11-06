import { useSyncExternalStore } from 'react';
import { alertBanners } from '../../host/alert-banners';
import { interfacePreferences, type InAppAlertStyle } from '../interface-preferences';

export function useDeviceAlert(placement: InAppAlertStyle) {
  const alert = useSyncExternalStore(alertBanners.subscribe, alertBanners.getSnapshot);
  const preferences = useSyncExternalStore(
    interfacePreferences.subscribe,
    interfacePreferences.getSnapshot,
  );
  return preferences.inAppAlerts && preferences.inAppAlertStyle === placement ? alert : undefined;
}
