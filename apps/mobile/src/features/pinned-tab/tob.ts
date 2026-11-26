type TobRoster = { bots: readonly { slug: string; tob?: boolean | undefined }[] };

export function tobSlug(roster: TobRoster | undefined): string | null | undefined {
  if (roster === undefined) return undefined;
  return roster.bots.find((bot) => bot.tob === true)?.slug ?? null;
}
