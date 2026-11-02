import { useLocalSearchParams } from 'expo-router';

import { useHostSession } from '../../../src/host/host-session';
import { ApprovalRulesPage } from '../../../src/ui/chat/approval-records';

export default function ApprovalRulesScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { client } = useHostSession();
  if (client === undefined) return null;
  return <ApprovalRulesPage client={client} slug={slug} key={slug} />;
}
