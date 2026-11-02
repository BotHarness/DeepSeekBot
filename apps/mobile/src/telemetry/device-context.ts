export type TotalMemoryBucket = '<=4' | '8' | '16' | '32' | '64plus' | 'unknown';
export interface DeviceTelemetryContext {
  os_version: string;
  device_class: 'phone' | 'tablet' | 'unknown';
  device_model: string;
  total_mem_gb_bucket: TotalMemoryBucket;
  device_year_class: number | 'unknown';
}

export const isPublicModelId = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:iPhone|iPad|iPod)\d{1,3},\d{1,3}$/u.test(value);
export const isDeviceYearClass = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 2000 && value <= 2100;

export function totalMemoryBucket(bytes: number | null): TotalMemoryBucket {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return 'unknown';
  const gb = bytes / 1024 ** 3;
  return gb <= 4 ? '<=4' : gb <= 8 ? '8' : gb <= 16 ? '16' : gb <= 32 ? '32' : '64plus';
}

export function deviceTelemetryContext(facts: {
  osVersion: string | null;
  deviceClass: DeviceTelemetryContext['device_class'];
  modelId: string | null;
  totalMemory: number | null;
  deviceYearClass: number | null;
}): DeviceTelemetryContext {
  const os = /^(\d{1,3})(?:\.(\d{1,3}))?(?:\.\d+)*$/u.exec(facts.osVersion ?? '');
  return {
    os_version: os === null ? 'unknown' : `${os[1]}.${os[2] ?? '0'}`,
    device_class: facts.deviceClass,
    device_model: isPublicModelId(facts.modelId) ? facts.modelId : 'unknown',
    total_mem_gb_bucket: totalMemoryBucket(facts.totalMemory),
    device_year_class: isDeviceYearClass(facts.deviceYearClass) ? facts.deviceYearClass : 'unknown',
  };
}
