import type { BridgeMethodsDeps, PersonaBotDetail } from '../../bridge/methods.js';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { HumanContext } from '../../humans/context.js';
import { botOwner } from '../../team/bot-access.js';
import { detail } from './methods.js';

export function createBotDetails(human: HumanContext, deps: BridgeMethodsDeps) {
  const runnerOf = (slug: string) => {
    const orchestratorRunner = deps.orchestratorRunner?.(slug);
    return orchestratorRunner === undefined ? {} : { orchestratorRunner };
  };
  const detailOf = (record: PersonaBotRecord): { bot: PersonaBotDetail } => ({
    bot: {
      ...detail(record, deps.states.snapshot(record.slug), deps.tob?.isTob(record.slug)),
      ...runnerOf(record.slug),
      ...(human.caller !== 'bot' && botOwner(record) === human.humanId && deps.tob
        ? { managementGrants: deps.tob.managementGrants(record.slug) }
        : {}),
      ownerHumanId: botOwner(record),
      owner: botOwner(record) === human.humanId,
      ...(botOwner(record) !== human.humanId || deps.team?.bots.hasForeignDms(human, record.slug)
        ? { sessions: {} }
        : {}),
    },
  });
  return { runnerOf, detailOf };
}
