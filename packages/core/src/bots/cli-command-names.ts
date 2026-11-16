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
const canonicalCommands = new Map(
  [...activityCommandNames].map(([current, legacy]) => [legacy, current]),
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
