const activityCommandNames = new Map([
  ['activity', 'inbox'],
  ['activity-watch', 'inbox-watch'],
  ['activity-status', 'inbox-status'],
  ['activity-dismiss', 'inbox-dismiss'],
  ['activity-restore', 'inbox-restore'],
  ['activity-dismiss-all', 'inbox-dismiss-all'],
  ['activity-allow-once', 'inbox-allow-once'],
  ['activity-ignore', 'inbox-ignore'],
  ['activity-snooze', 'inbox-snooze'],
]);
const loadoutCommandNames = new Map([
  ['loadouts', 'bot-modes'],
  ['loadout-default-set', 'bot-mode-default-set'],
  ['loadout-set', 'bot-mode-set'],
  ['loadout-template-save', 'bot-mode-template-save'],
  ['loadout-template-delete', 'bot-mode-template-delete'],
  ['loadout-template-set', 'bot-mode-template-set'],
]);
const canonicalCommands = new Map(
  [...activityCommandNames, ...loadoutCommandNames].map(([current, legacy]) => [legacy, current]),
);

export function canonicalCliCommandName(command: string): string {
  return canonicalCommands.get(command) ?? command;
}

export function legacyActivityCommandName(command: string): string {
  return activityCommandNames.get(command) ?? command;
}

export function isActivityCliCommand(command: string): boolean {
  return activityCommandNames.has(command) || canonicalCommands.has(command);
}
