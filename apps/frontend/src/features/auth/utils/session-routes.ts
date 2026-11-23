const protectedRoutes = ['/chat', '/friends', '/profile', '/settings', '/explore'];

export function isProtectedRoute(path: string): boolean {
  return protectedRoutes.some((route) => path === route || path.startsWith(`${route}/`));
}

export function getLoginDestination(search: string): string {
  const redirect = new URLSearchParams(search).get('redirect');
  if (redirect && isProtectedRoute(redirect.split(/[?#]/, 1)[0])) return redirect;
  return '/friends';
}
