export const swipeEntry = 'swipe';

type Route = { params?: object | undefined };

export function swipedIn(route: Route): boolean {
  return (route.params as { entry?: unknown } | undefined)?.entry === swipeEntry;
}

export function swipeEntryOptions(route: Route): { animation?: 'none' } {
  return swipedIn(route) ? { animation: 'none' } : {};
}

export function swipeEntryListeners<A extends string>(animation: A) {
  return ({
    navigation,
    route,
  }: {
    navigation: { setOptions(options: { animation: A }): void };
    route: Route;
  }) => ({
    transitionEnd: () => {
      if (swipedIn(route)) navigation.setOptions({ animation });
    },
  });
}

export function swipeHref(href: string): string {
  return `${href}${href.includes('?') ? '&' : '?'}entry=${swipeEntry}`;
}
