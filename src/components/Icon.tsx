import type { SVGProps } from 'react';

export type IconName = 'arrow-left' | 'arrow-right' | 'chevron-down' | 'close' | 'moon' | 'sun' | 'type';

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
};

export function Icon({ name, ...props }: IconProps) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };

  switch (name) {
    case 'arrow-left':
      return <svg {...common}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>;
    case 'arrow-right':
      return <svg {...common}><path d="M5 12h14m-7-7 7 7-7 7" /></svg>;
    case 'chevron-down':
      return <svg {...common}><path d="m6 9 6 6 6-6" /></svg>;
    case 'close':
      return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>;
    case 'moon':
      return <svg {...common}><path d="M20.5 14.7A8.5 8.5 0 0 1 9.3 3.5 8.5 8.5 0 1 0 20.5 14.7Z" /></svg>;
    case 'sun':
      return <svg {...common}><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    case 'type':
      return <svg {...common}><path d="M5 5h14M12 5v14M8 19h8" /></svg>;
    default:
      return null;
  }
}
