import { DrawerMaterial } from '../primitives/drawer-material';

export function NavigationMaterial({ rounded = false }: { rounded?: boolean; circle?: boolean }) {
  return <DrawerMaterial rounded={rounded} glassPanel={rounded} />;
}
