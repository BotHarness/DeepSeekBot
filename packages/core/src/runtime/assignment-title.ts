export const ASSIGNMENT_TITLE_MAX_LENGTH = 80;
export const ASSIGNMENT_DESCRIPTION_MAX_LENGTH = 600;

const DERIVED_TITLE_LENGTH = 40;

export function deriveAssignmentTitle(description: string): string {
  const line =
    description
      .split(/\r?\n/u)
      .map((part) => part.replace(/\s+/gu, ' ').trim())
      .find((part) => part !== '') ?? '';
  const chars = [...line];
  if (chars.length <= DERIVED_TITLE_LENGTH) return line === '' ? 'Assignment' : line;
  const head = chars.slice(0, DERIVED_TITLE_LENGTH).join('');
  const sentence = /^(.{12,}?[.!?。！？；;:：])(?:\s|$)/u.exec(head)?.[1];
  if (sentence !== undefined) return sentence.replace(/[.。;；:：]$/u, '');
  const space = /\s/u.test(chars[DERIVED_TITLE_LENGTH]!) ? head.length : head.lastIndexOf(' ');
  const cut = space >= 12 ? head.slice(0, space) : head;
  return `${cut.replace(/[\s,，、.。;；:：-]+$/u, '')}…`;
}
