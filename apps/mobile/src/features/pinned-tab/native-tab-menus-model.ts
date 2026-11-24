export type NativeTabMenuItem = { id: string; label: string; symbol: string };

export type NativeTabMenuSpec = {
  tab: string;
  name: string;
  recent: NativeTabMenuItem[];
  actions: NativeTabMenuItem[];
};

export type NativeTabMenusProps = {
  tabs: NativeTabMenuSpec[];
  pill: boolean;
  onSelect(tab: string, id: string): void;
};
