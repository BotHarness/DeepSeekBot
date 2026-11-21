import { Segmented } from '../primitives/segmented';
import { useStrings } from '../strings';

export function MarketplaceSectionPicker({
  section,
  onChange,
}: {
  section: 'bots' | 'avatars';
  onChange(value: 'bots' | 'avatars'): void;
}) {
  const copy = useStrings().marketplaceAvatars;
  return (
    <Segmented
      label={copy.browse}
      value={section}
      onChange={onChange}
      options={[
        { value: 'bots', label: copy.bots },
        { value: 'avatars', label: copy.title },
      ]}
    />
  );
}
