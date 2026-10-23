export type PlusMenuItem = {
  id: string;
  label: string;
  symbol: string;
  run(): void;
  children?: PlusMenuItem[];
};
export type PlusMenuButtonProps = {
  label: string;
  testID: string;
  size: number;
  embedded?: boolean;
  disabled?: boolean;
  items: PlusMenuItem[];
};

export function findMenuItem(items: PlusMenuItem[], id: string): PlusMenuItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const nested = item.children && findMenuItem(item.children, id);
    if (nested) return nested;
  }
}
