export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function failure(status: number, code: string, cause?: string): Response {
  return json(status, { error: cause === undefined ? { code } : { code, cause } });
}

export async function readBody(
  request: Request,
  limit?: number,
): Promise<Record<string, unknown> | undefined> {
  try {
    let body: unknown;
    if (limit === undefined) body = await request.json();
    else {
      const reader = request.body?.getReader();
      if (reader === undefined) return undefined;
      const decoder = new TextDecoder();
      let text = '';
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > limit) {
            await reader.cancel();
            return undefined;
          }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
      body = JSON.parse(text);
    }
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
