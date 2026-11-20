export const zh = {
  'tob.defaultName': '托布',
} as const;

export const en = {
  'tob.defaultName': 'Tob',
} satisfies Record<keyof typeof zh, string>;
