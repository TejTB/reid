// Single source of truth for Reid's native design system.
//
// `constants/colors.ts` and `constants/fonts.ts` re-export from here so
// existing imports (Colors.bgDark, Fonts.serifItalic) keep working while
// new code uses the shorter `C`/`F`/`R`/`S` tokens from this file.

export const C = {
  bg: '#0A1628',
  surface: '#0F1E35',
  surfaceRaised: '#162236',
  surfaceGlass: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.07)',
  borderActive: 'rgba(255,255,255,0.14)',
  text: '#F2EDE3',
  textDim: 'rgba(242,237,227,0.25)',
  muted: 'rgba(242,237,227,0.45)',
  red: '#B91C1C',
  redDim: 'rgba(185,28,28,0.15)',
  redFocus: 'rgba(185,28,28,0.5)',
  success: '#16a34a',
  successDim: 'rgba(22,163,74,0.15)',
  amber: '#d97706',
  amberDim: 'rgba(217,119,6,0.15)',
  blue: '#2563eb',
  blueDim: 'rgba(37,99,235,0.15)',
} as const;

export const F = {
  serif: 'PlayfairDisplay_700Bold_Italic',
  serifReg: 'PlayfairDisplay_400Regular',
  serifItalic: 'PlayfairDisplay_400Regular_Italic',
  sans: 'Inter_400Regular',
  sansMed: 'Inter_500Medium',
  sansBold: 'Inter_700Bold',
} as const;

export const R = { sm: 8, md: 12, lg: 16, pill: 999, bubble: 20, button: 8 } as const;

export const S = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

// Observation category colour map (used by the Noticed screen).
export const OBSERVATION_BADGE: Record<string, string> = {
  avoidance: '#B91C1C',
  pattern: '#d97706',
  contradiction: '#1d4ed8',
  strength: '#16a34a',
};
