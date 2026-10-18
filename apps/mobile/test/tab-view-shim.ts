import { createElement, useRef, type ReactNode } from 'react';

type Route = { key: string };
export function TabView({
  navigationState,
  onIndexChange,
  renderTabBar,
  renderScene,
}: {
  navigationState: { index: number; routes: Route[] };
  onIndexChange(index: number): void;
  renderTabBar(props: object): ReactNode;
  renderScene(props: { route: Route }): ReactNode;
}) {
  const { routes, index } = navigationState;
  const visited = useRef(new Set<string>());
  visited.current.add(routes[index]!.key);
  return createElement(
    'div',
    null,
    renderTabBar({
      position: { interpolate: () => 0 },
      jumpTo: (key: string) => onIndexChange(routes.findIndex((route) => route.key === key)),
    }),
    createElement('button', {
      'data-testid': 'pager-next',
      onClick: () => onIndexChange(Math.min(index + 1, routes.length - 1)),
    }),
    createElement('button', {
      'data-testid': 'pager-previous',
      onClick: () => onIndexChange(Math.max(index - 1, 0)),
    }),
    ...routes
      .filter((route) => visited.current.has(route.key))
      .map((route) =>
        createElement(
          'div',
          { key: route.key, hidden: route.key !== routes[index]?.key },
          renderScene({ route }),
        ),
      ),
  );
}
