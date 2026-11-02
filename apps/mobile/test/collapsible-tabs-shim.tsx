import {
  Children,
  Fragment,
  createElement,
  isValidElement,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Page = { name: string; children: ReactNode };
type Selection = { nativeEvent: { position: number } };
type Pager = {
  containerRef: {
    current: { setPage(index: number): void; setPageWithoutAnimation(index: number): void };
  };
};

function Container({
  children,
  initialTabName,
  renderHeader,
  renderTabBar,
  pagerProps,
}: {
  children: ReactNode;
  initialTabName?: string;
  renderHeader?(): ReactNode;
  renderTabBar(pager: Pager): ReactNode;
  pagerProps?: { onPageSelected?(event: Selection): void };
}) {
  const pages = Children.toArray(children).filter(isValidElement<Page>);
  const [index, setIndex] = useState(() =>
    pages.findIndex((page) => page.props.name === initialTabName),
  );
  const selected = useRef(pagerProps?.onPageSelected);
  selected.current = pagerProps?.onPageSelected;
  const [containerRef] = useState(() => {
    const select = (position: number) => {
      setIndex(position);
      selected.current?.({ nativeEvent: { position } });
    };
    return { current: { setPage: select, setPageWithoutAnimation: select } };
  });
  return (
    <>
      {renderHeader?.()}
      {renderTabBar({ containerRef })}
      {pages.map((page, position) => (
        <div key={page.props.name} hidden={position !== index}>
          {page}
        </div>
      ))}
    </>
  );
}

function FlatList<T>({
  data,
  keyExtractor,
  renderItem,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  testID,
}: {
  data: readonly T[];
  keyExtractor(item: T): string;
  renderItem(info: { item: T }): ReactNode;
  ListHeaderComponent?: ReactNode;
  ListEmptyComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
  testID?: string;
}) {
  return createElement(
    'div',
    { 'data-testid': testID },
    ListHeaderComponent,
    data.length === 0
      ? ListEmptyComponent
      : data.map((item) =>
          createElement(Fragment, { key: keyExtractor(item) }, renderItem({ item })),
        ),
    ListFooterComponent,
  );
}

export const Tabs = { Container, Tab: ({ children }: Page) => children, FlatList };
