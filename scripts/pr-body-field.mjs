const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const EMPHASIS = '(?:\\*\\*|__)?';
const NEXT_FIELD = /^(?:#{1,6}\s|[-*]\s+(?:\*\*|__)?[A-Z][\w /-]{2,30}(?:\*\*|__)?\s*[:：.])/u;

export function field(body, label, { inline = false } = {}) {
  const name = `${EMPHASIS}${escape(label)}${EMPHASIS}`;
  const start = new RegExp(
    `^\\s*(?:(?:[-*]\\s+)?${name}\\s*[:：.]\\s*${EMPHASIS}\\s*(.*)|#{2,6}\\s+${name}\\s*[:：.]?\\s*)$`,
    'iu',
  );
  const lines = (body ?? '').split(/\r?\n/u);
  const index = lines.findIndex((line) => start.test(line));
  if (index === -1) return undefined;
  const parts = [(start.exec(lines[index])[1] ?? '').trim()];
  if (inline) return parts[0];
  for (const line of lines.slice(index + 1)) {
    if (NEXT_FIELD.test(line)) break;
    if (line.trim() === '' && parts.join('').trim() !== '') break;
    parts.push(line.trim());
  }
  return parts.join(' ').trim();
}
