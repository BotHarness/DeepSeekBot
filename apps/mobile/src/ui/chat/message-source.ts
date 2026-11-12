import type { ConversationMessage } from '../../host/conversation';

export function messageSource(message: ConversationMessage): string {
  const html = message.genuiDocument?.html;
  return html === undefined
    ? message.body
    : message.body === ''
      ? html
      : `${message.body}\n\n${html}`;
}
