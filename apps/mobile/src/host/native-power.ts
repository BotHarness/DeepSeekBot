const LOW_BATTERY = 0.2;

export async function powerConstrained(): Promise<boolean> {
  try {
    const battery = await import('expo-battery');
    if (await battery.isLowPowerModeEnabledAsync()) return true;
    const [level, state] = await Promise.all([
      battery.getBatteryLevelAsync(),
      battery.getBatteryStateAsync(),
    ]);
    return level >= 0 && level < LOW_BATTERY && state === battery.BatteryState.UNPLUGGED;
  } catch {
    return false;
  }
}
