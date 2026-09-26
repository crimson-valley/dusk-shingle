import type { MouseEvent } from 'react';

export function navigateTo(href: string): void {
  if (window.location.pathname === href) {
    window.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }

  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function isModifiedClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}
