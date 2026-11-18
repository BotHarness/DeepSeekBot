type HeaderWebSocket = new (
  url: string,
  protocols: undefined,
  options: { headers: Record<string, string> },
) => WebSocket;

export function openWebSocket(url: string, headers: Record<string, string>): WebSocket {
  if (Object.keys(headers).length === 0) return new WebSocket(url);
  return new (WebSocket as unknown as HeaderWebSocket)(url, undefined, { headers });
}
