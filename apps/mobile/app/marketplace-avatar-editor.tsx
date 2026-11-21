import { Redirect } from 'expo-router';
import { marketplaceAvatarsAvailable } from '../src/marketplace/available';
import { MarketplaceAvatarEditorScreen } from '../src/ui/shell/marketplace-avatar-editor-screen';

export default function MarketplaceAvatarEditorScreenRoute() {
  return marketplaceAvatarsAvailable ? (
    <MarketplaceAvatarEditorScreen />
  ) : (
    <Redirect href="/marketplace" />
  );
}
