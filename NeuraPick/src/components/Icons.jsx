const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const IconSwap = () => (
  <svg {...base}>
    <path d="M7 4 3 8l4 4" /><path d="M3 8h13" /><path d="m17 20 4-4-4-4" /><path d="M21 16H8" />
  </svg>
)
export const IconShield = () => (
  <svg {...base}>
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
  </svg>
)
export const IconTarget = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
)
export const IconClock = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
)
export const IconUndo = () => (
  <svg {...base} width={15} height={15}>
    <path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </svg>
)
export const IconRestart = () => (
  <svg {...base} width={15} height={15}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
  </svg>
)
export const IconCopy = () => (
  <svg {...base} width={15} height={15}>
    <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
)
export const IconPlay = () => (
  <svg {...base} width={16} height={16}>
    <path d="m6 4 14 8-14 8z" fill="currentColor" />
  </svg>
)
