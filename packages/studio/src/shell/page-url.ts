/** What the page needs to find the backend rides in the fragment, which a browser never sends: the static server and its log do not see the token. */
export function pageUrl(page: { origin: string; socket: string; token: string }): string {
  return `${page.origin}/#${new URLSearchParams({ socket: page.socket, token: page.token }).toString()}`;
}
