import { useLocalSearchParams } from 'expo-router';

import {
  modelScopeKey,
  type AssignmentEffortTarget,
  type ModelField,
  type ModelScope,
} from '@botharness/host-client/model-settings';
import { useHostSession } from '../../host/host-session';
import { useStrings } from '../strings';
import { ModelsView } from './model-settings-screen';
import { SheetNote } from './sheet';

export function ModelSettingsScreen({
  kind,
  pick = false,
}: {
  kind: ModelScope['kind'];
  pick?: boolean;
}) {
  const t = useStrings();
  const {
    slug = '',
    id = '',
    field = 'orchestrator',
    provider = '',
    model = '',
    group = '',
  } = useLocalSearchParams<{
    slug: string;
    id: string;
    field: string;
    provider: string;
    model: string;
    group: string;
  }>();
  const { client, saved } = useHostSession();
  const scope: ModelScope =
    kind === 'bot'
      ? { kind, slug }
      : kind === 'preset' || (pick && id !== '')
        ? { kind: 'preset', id }
        : { kind: 'global' };
  const picker: ModelField | undefined = pick
    ? [
        'assignment',
        'allowed',
        'allowed-effort',
        'orchestrator-effort',
        'assignment-effort',
      ].includes(field)
      ? (field as ModelField)
      : 'orchestrator'
    : undefined;
  const effortTarget: AssignmentEffortTarget | undefined =
    group !== ''
      ? { kind: 'group', id: group }
      : provider !== '' && model !== ''
        ? { kind: 'model', provider, model }
        : undefined;
  if (client === undefined) return <SheetNote>{t.unreachable}</SheetNote>;
  return (
    <ModelsView
      key={`${saved?.hostId}:${modelScopeKey(scope)}:${picker ?? ''}:${group}:${provider}/${model}`}
      client={client}
      scope={scope}
      picker={picker}
      effortTarget={effortTarget}
    />
  );
}
