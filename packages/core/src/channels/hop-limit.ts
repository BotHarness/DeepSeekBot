export class BotHopLimitReached extends Error {
  readonly code = 'collaboration-hop-limit';

  constructor(
    readonly hop: number,
    readonly limit: number,
  ) {
    super(`Bot collaboration hop limit reached (${hop} > ${limit})`);
    this.name = 'BotHopLimitReached';
  }
}
