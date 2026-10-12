const PREFIX = '#botharness-private-input=';

export function privateInputWebUrl(base: string, channelId: string, messageId: string): string {
  const url = new URL(base);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Private input Web URL must be an explicit credential-free Web origin');
  url.hash = PREFIX.slice(1) + encodeURIComponent(JSON.stringify([channelId, messageId]));
  return url.href;
}

export function privateInputLocator(
  hash: string,
): { channelId: string; messageId: string } | undefined {
  if (!hash.startsWith(PREFIX) || hash.length > 1024) return undefined;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(hash.slice(PREFIX.length)));
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== 'string' ||
      !/^dm-[A-Za-z0-9_-]{1,100}$/.test(value[0]) ||
      typeof value[1] !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(value[1])
    )
      return undefined;
    return { channelId: value[0], messageId: value[1] };
  } catch {
    return undefined;
  }
}
