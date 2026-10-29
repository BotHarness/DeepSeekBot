import { Button } from './button';

export interface CreationConfirmProps {
  label: string;
  testID: string;
  disabled: boolean;
  busy: boolean;
  onPress(): void;
}

export function CreationConfirm(props: CreationConfirmProps) {
  return <Button {...props} tone="primary" variant="text" />;
}
