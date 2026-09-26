import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { isModifiedClick, navigateTo } from '../lib/navigation';

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

export function Link({ href, onClick, ...props }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    if (event.defaultPrevented || isModifiedClick(event) || href.startsWith('#')) {
      return;
    }

    event.preventDefault();
    navigateTo(href);
  }

  return <a href={href} onClick={handleClick} {...props} />;
}
