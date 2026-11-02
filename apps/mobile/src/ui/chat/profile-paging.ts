import { createContext, useContext } from 'react';

export type ProfileActivitySource = {
  channelId: string | undefined;
  messageId: string | undefined;
};

export type ProfilePaging = {
  visible: boolean;
  focused: boolean;
  activity: ProfileActivitySource | undefined;
  setActivity(source: ProfileActivitySource): void;
  open(): void;
  close(): void;
  leaveChat(): void;
  setEnabled(enabled: boolean): void;
};

export const ProfilePagingContext = createContext<ProfilePaging | undefined>(undefined);

export function useProfilePaging() {
  return useContext(ProfilePagingContext);
}
