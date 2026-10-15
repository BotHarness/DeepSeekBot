import { AppIconSettings } from '../src/ui/app-icon-settings';
import { appIconPreviews, nativeAppIcon } from '../src/ui/native-app-icon';

export default function AppIconScreen() {
  return <AppIconSettings port={nativeAppIcon} previews={appIconPreviews} />;
}
