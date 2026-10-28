export type ChatsSearchResult = {
  key: string;
  title: string;
  subtitle: string;
  initial: string;
  image: string;
  dimmed: boolean;
  section?: string;
  trailing?: string;
};

export type ChatsSearchBarProps = {
  placeholder: string;
  busy: boolean;
  results: ChatsSearchResult[];
  onQuery(value: string): void;
  onExpanded(expanded: boolean): void;
  onPick(key: string): void;
  onNavigation(): void;
};

export function ChatsSearchBar(_: ChatsSearchBarProps): null {
  return null;
}
