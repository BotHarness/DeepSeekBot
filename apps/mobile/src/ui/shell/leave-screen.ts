type Router = { canGoBack(): boolean; back(): void; replace(href: '/'): void };

export function leaveScreen(router: Router): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
