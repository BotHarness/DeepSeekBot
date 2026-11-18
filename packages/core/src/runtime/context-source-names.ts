export const CONTEXT_SOURCES = [
  'system',
  'tools',
  'human',
  'inbox-mention',
  'inbox-schedule',
  'inbox-memory',
  'inbox-assignment',
  'inbox-open',
  'host',
  'skills',
  'attachments',
  'replies',
  'thinking',
  'tool-use',
  'summary',
  'other',
] as const;

export type ContextSource = (typeof CONTEXT_SOURCES)[number];
