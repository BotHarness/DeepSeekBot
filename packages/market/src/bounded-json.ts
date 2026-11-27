export async function readBoundedJson(request: Request, limit: number) {
  if (request.body === null) return { kind: 'invalid' as const };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > limit) {
        await reader.cancel().catch(() => undefined);
        return { kind: 'oversize' as const };
      }
      chunks.push(chunk.value);
    }
    const decoder = new TextDecoder();
    const body: unknown = JSON.parse(
      chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') + decoder.decode(),
    );
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      return { kind: 'body' as const, body: Object.fromEntries(Object.entries(body)) };
    }
  } catch {
    return { kind: 'invalid' as const };
  } finally {
    reader.releaseLock();
  }
  return { kind: 'invalid' as const };
}
