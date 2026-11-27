export const DEVICE_GATEWAY_PREFIX = '/botharness-device';
export function encryptedGatewayPathAllowed(path: string): boolean {
  if (
    !path.startsWith('/botharness-device/') ||
    path.includes('\\') ||
    path.includes('#') ||
    /%2f|%5c|%2e|\/\.{1,2}(?:\/|\?|$)/iu.test(path)
  )
    return false;
  let name: string;
  try {
    name = new URL(`http://device${decodeURIComponent(path.split('?')[0]!)}`).pathname.replace(
      /\/{2,}/gu,
      '/',
    );
  } catch {
    return false;
  }
  return (
    (name.startsWith('/botharness-device/api/') &&
      !/\/(?:webrtc|web|browser|computer|voice)(?:\/|$)/u.test(name)) ||
    [
      '/botharness-device/activity',
      '/botharness-device/activity/prepare',
      '/botharness-device/activity/register',
      '/botharness-device/activity/stop',
      '/botharness-device/activity/status',
    ].includes(name) ||
    name === '/botharness-device/push' ||
    name.startsWith('/botharness-device/push/') ||
    name === '/botharness-device/team/device-password' ||
    name === '/botharness-device/feed-read' ||
    name === '/botharness-device/unpair' ||
    name === '/botharness-device/devices/remove'
  );
}
