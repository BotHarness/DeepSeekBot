const TEAM_PATH =
  /^(?:(?:deepseekbot|deepseekbot-dev):\/\/\/?|\/)team\/?\?(?:[^#]*&)?i=([A-Za-z0-9_-]+)/u;

export function teamInvitationRoute(path: string): string | undefined {
  const match = TEAM_PATH.exec(path);
  return match === null ? undefined : `/pair/team?i=${match[1]}`;
}
