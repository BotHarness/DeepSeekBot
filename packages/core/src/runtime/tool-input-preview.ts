const PREVIEW_FIELDS = ['command', 'cmd', 'script', 'code', 'url', 'path', 'file_path'];

export function toolInputPreview(input: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return input;
  }
  if (typeof parsed === 'string') return parsed;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return input;
  const fields = parsed as Record<string, unknown>;
  const value =
    fields[PREVIEW_FIELDS.find((field) => field in fields) ?? Object.keys(fields)[0] ?? ''];
  return value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
}
