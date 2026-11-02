import { useLocalSearchParams } from 'expo-router';

import { useHostSession } from '../../../src/host/host-session';
import { ApprovalHistoryPage } from '../../../src/ui/chat/approval-records';

export default function ApprovalHistoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { client } = useHostSession();
  if (client === undefined) return null;
  return <ApprovalHistoryPage client={client} slug={slug} key={slug} />;
}
