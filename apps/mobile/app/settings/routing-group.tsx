import { useLocalSearchParams } from 'expo-router';

import { useHostSession } from '../../src/host/host-session';
import { RoutingGroupEditorRoute } from '../../src/ui/chat/routing-group-editor';
import { SheetNote } from '../../src/ui/chat/sheet';
import { useStrings } from '../../src/ui/strings';

export default function RoutingGroupScreen() {
  const t = useStrings();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { client, saved } = useHostSession();
  if (client === undefined) return <SheetNote>{t.unreachable}</SheetNote>;
  return <RoutingGroupEditorRoute key={`${saved?.hostId}:${id}`} client={client} id={id} />;
}
