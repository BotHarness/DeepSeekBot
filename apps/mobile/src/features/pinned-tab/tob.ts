type StewardRoster = { bots: readonly { slug: string; tob?: boolean | undefined }[] };

export function stewardSlug(roster: StewardRoster | undefined): string | null | undefined {
  if (roster === undefined) return undefined;
  return roster.bots.find((bot) => bot.tob === true)?.slug ?? null;
}
