import { memberPage } from '../../member-page.js';

export function createMemberBridgeGuard(memberMethods: ReadonlySet<string>) {
  const member = memberPage();
  return (endpoint: string): boolean => member && !memberMethods.has(endpoint);
}
