import type { ReactNode } from 'react';
import { Modal, View } from 'react-native';

export function MarketplaceTopicSheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose(): void;
}) {
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onClose}
    >
      <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={{ flex: 1 }}>
        {children}
      </View>
    </Modal>
  );
}
