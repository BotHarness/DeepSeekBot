import { Redirect } from 'expo-router';
import { marketplaceAvatarsAvailable } from '../src/marketplace/available';
import { MarketplaceAvatarMineScreen } from '../src/ui/shell/marketplace-avatar-mine-screen';

export default function MarketplaceAvatarMineScreenRoute() {
  return marketplaceAvatarsAvailable ? (
    <MarketplaceAvatarMineScreen />
  ) : (
    <Redirect href="/marketplace" />
  );
}
