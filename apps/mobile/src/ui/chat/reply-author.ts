import { createContext } from 'react';
import type { WireReplyPreview } from '@botharness/host-protocol/wire';

export type ReplyPeople = readonly { humanId: string; displayName: string }[];

export const ReplyPeopleContext = createContext<ReplyPeople | undefined>(undefined);

export function replyAuthor(
  preview: WireReplyPreview | null | undefined,
  you: string,
  botName: (id: string) => string,
  member = you,
  people?: ReplyPeople,
): string {
  switch (preview?.author.kind) {
    case 'human': {
      const { humanId } = preview.author;
      if (humanId === undefined) return you;
      return (
        people?.find((entry) => entry.humanId === humanId)?.displayName ||
        preview.author.displayName ||
        member
      );
    }
    case 'bot':
      return botName(preview.author.slug);
    case 'bridged':
      return preview.author.source;
    case 'remote-bot':
    case 'system':
    case undefined:
      return '';
  }
}
