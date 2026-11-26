import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';
import { tabChrome } from '../../ui/design/tokens';
import type { NativeTabMenusProps } from './native-tab-menus-model';

type NativeProps = ViewProps & {
  tabs: NativeTabMenusProps['tabs'];
  pill: boolean;
  pillFade: number;
  pillHold: number;
  onSelect(event: NativeSyntheticEvent<{ tab: string; id: string }>): void;
};

const Native =
  requireOptionalNativeModule('NativeTabMenus') === null
    ? undefined
    : requireNativeView<NativeProps>('NativeTabMenus');

export function NativeTabMenus({ tabs, pill, onSelect }: NativeTabMenusProps) {
  if (Native === undefined) return null;
  return (
    <Native
      pointerEvents="none"
      style={{ position: 'absolute', width: 0, height: 0 }}
      tabs={tabs}
      pill={pill}
      pillFade={tabChrome.pillFade}
      pillHold={tabChrome.pillHold}
      onSelect={({ nativeEvent }) => onSelect(nativeEvent.tab, nativeEvent.id)}
    />
  );
}
