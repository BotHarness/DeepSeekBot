import { View } from 'react-native';
import { useDesignTheme } from '../../ui/design/theme';
import { NavigationAction } from '../../ui/shell/navigation-action';
import { SessionDrawerNewButton } from './session-drawer-new-button';

export type SessionDrawerFooterActionsProps = {
  searchLabel: string;
  createLabel: string;
  canSearch: boolean;
  canCreate: boolean;
  onSearch(): void;
  onCreate(): void;
};

export function SessionDrawerFooterActions({
  searchLabel,
  createLabel,
  canSearch,
  canCreate,
  onSearch,
  onCreate,
}: SessionDrawerFooterActionsProps) {
  const theme = useDesignTheme();
  return (
    <>
      <NavigationAction
        search
        size={theme.touch}
        label={searchLabel}
        testID="session-drawer-search"
        disabled={!canSearch}
        onPress={() => {
          if (canSearch) onSearch();
        }}
      />
      {canCreate ? (
        <SessionDrawerNewButton label={createLabel} onPress={onCreate} />
      ) : (
        <View style={{ flex: 1 }} />
      )}
    </>
  );
}
