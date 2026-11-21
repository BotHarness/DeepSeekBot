import { Redirect } from 'expo-router';
import { marketplaceAvatarsAvailable } from '../src/marketplace/available';
import { MarketplaceAvatarScreen } from '../src/ui/shell/marketplace-avatar-screen';

export default function MarketplaceAvatarScreenRoute() {
  return marketplaceAvatarsAvailable ? (
    <MarketplaceAvatarScreen />
  ) : (
    <Redirect href="/marketplace" />
  );
}
