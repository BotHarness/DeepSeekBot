import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { retainedSearch, useRetainedSearch } from '../../host/native-retained-search';
import { hostSession } from '../../host/host-session';
import type { SearchHit } from '../../host/retained-search';
import { useStrings } from '../strings';

export function useChatsRetainedSearch(scope: string, query: string) {
  const t = useStrings();
  const snapshot = useRetainedSearch();
  const [error, setError] = useState<string>();
  const opening = useRef(false);
  const focused = useIsFocused();
  const currentFocus = useRef(focused);
  currentFocus.current = focused;
  useFocusEffect(
    useCallback(() => {
      if (retainedSearch.getSnapshot().scope !== scope) retainedSearch.enter(scope);
      if (retainedSearch.getSnapshot().query !== query) retainedSearch.schedule(query);
      retainedSearch.setActive(true);
      setError(undefined);
      return () => retainedSearch.setActive(false);
    }, [scope, query]),
  );
  const open = async (hit: SearchHit) => {
    if (opening.current) return;
    opening.current = true;
    setError(undefined);
    Keyboard.dismiss();
    try {
      const ownsInteraction = () =>
        currentFocus.current &&
        retainedSearch.getSnapshot().query === snapshot.query &&
        retainedSearch.getSnapshot().scope === snapshot.scope;
      const result = await retainedSearch.resolve(hit);
      if (!ownsInteraction()) return;
      if (result === 'detached') {
        setError(t.sourceChanged);
        return;
      }
      const paired = () =>
        hostSession
          .getState()
          .hosts.some((h) => h.hostId === hit.source.hostId && h.deviceId === hit.source.deviceId);
      if (
        !paired() ||
        !(await hostSession.switchTo(hit.source.hostId, () => ownsInteraction() && paired())) ||
        !paired()
      ) {
        setError(t.sourceChanged);
        return;
      }
      if (
        !currentFocus.current ||
        retainedSearch.getSnapshot().query !== snapshot.query ||
        retainedSearch.getSnapshot().scope !== snapshot.scope
      )
        return;
      const params = {
        hostId: hit.source.hostId,
        deviceId: hit.source.deviceId,
        retained: '1',
        ...(hit.message ? { focus: hit.message.id } : {}),
      };
      if (hit.target.kind === 'dm')
        router.push({ pathname: '/dm/[slug]', params: { ...params, slug: hit.target.id } });
      else router.push({ pathname: '/channel/[id]', params: { ...params, id: hit.target.id } });
    } catch {
      setError(t.dialogFailed);
    } finally {
      opening.current = false;
    }
  };
  const current = snapshot.scope === scope && snapshot.query === query;
  return {
    snapshot,
    pending: snapshot.scope !== scope || snapshot.query !== query || snapshot.status === 'loading',
    error,
    open,
    retry: () => void retainedSearch.refresh(),
    conversations: current ? snapshot.conversations : [],
    messages: current ? snapshot.messages : [],
  };
}
