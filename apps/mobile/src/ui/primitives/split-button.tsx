export type SplitButtonItem = { key: string; label: string; path: string };

export type SplitButtonProps = {
  label: string;
  path: string;
  menuLabel: string;
  items: SplitButtonItem[];
  testID: string;
  disabled?: boolean;
  onPress(): void;
  onPick(key: string): void;
};

export function SplitButton(_: SplitButtonProps): null {
  return null;
}
