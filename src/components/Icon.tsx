import type { SVGProps } from 'react';

export type IconName = 'arrow-left' | 'arrow-right' | 'close' | 'type' | 'lock' | 'check' | 'reply' | 'flag' | 'mark' | 'copy';

type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

/** 1.5px-stroke line icons on a 24px grid. Always decorative; controls carry their own labels. */
export function Icon({ name, size = 16, ...props }: IconProps) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false, ...props,
  };
  switch (name) {
    case 'arrow-left': return <svg {...common}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>;
    case 'arrow-right': return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case 'close': return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>;
    case 'type': return <svg {...common}><path d="M4 18 9 6l5 12M5.8 14h6.4M15 18l3-7 3 7M15.9 16h4.2" /></svg>;
    case 'lock': return <svg {...common}><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
    case 'check': return <svg {...common}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
    case 'reply': return <svg {...common}><path d="M10 8 5 12.5l5 4.5M5 12.5h9a5 5 0 0 1 5 5V19" /></svg>;
    case 'flag': return <svg {...common}><path d="M6 21V4M6 4h11l-2 4 2 4H6" /></svg>;
    case 'mark': return <svg {...common}><path d="M4 16h16M8 12h8" /></svg>;
    case 'copy': return <svg {...common}><rect x="8" y="8" width="11" height="12" rx="1.5" /><path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15" /></svg>;
    default: return null;
  }
}
