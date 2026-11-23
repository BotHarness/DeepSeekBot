import { Platform } from 'react-native';
import { SheetHeader } from '../primitives/sheet-header';
import { CreationFlowSheet } from './creation-flow-owner';

export function CreationFlowLayout() {
  return (
    <CreationFlowSheet
      header={({ title, exit }) => (
        <SheetHeader title={title} {...(Platform.OS === 'ios' ? { onClose: exit } : {})} />
      )}
    />
  );
}
