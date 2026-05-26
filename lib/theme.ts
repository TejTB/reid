/**
 * Reid Design System — single source of truth.
 * Nothing in this app uses hardcoded colours, spacing, radii, or fonts.
 * Import `theme` and reference its tokens everywhere.
 */
export const theme = {
  bg: {
    primary: '#0A1628',
    deep: '#060E1C',
    card: 'rgba(255,255,255,0.04)',
    cardHover: 'rgba(255,255,255,0.07)',
    input: 'rgba(255,255,255,0.06)',
    overlay: 'rgba(6,14,28,0.92)',
  },
  border: {
    subtle: 'rgba(255,255,255,0.06)',
    default: 'rgba(255,255,255,0.10)',
    strong: 'rgba(255,255,255,0.16)',
  },
  text: {
    primary: '#F2EDE3',
    secondary: '#C8D5E3',
    dim: '#7A90A8',
    placeholder: 'rgba(122,144,168,0.6)',
  },
  accent: {
    red: '#B91C1C',
    redHover: '#991B1B',
    redGlow: 'rgba(185,28,28,0.35)',
    redDim: 'rgba(185,28,28,0.12)',
    redBorder: 'rgba(185,28,28,0.4)',
  },
  orb: {
    core: '#B91C1C',
    inner: '#DC2626',
    bright: '#EF4444',
    glow: 'rgba(185,28,28,0.4)',
    glowOuter: 'rgba(185,28,28,0.08)',
    particle: 'rgba(239,68,68,0.65)',
    particleDim: 'rgba(185,28,28,0.35)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    full: 9999,
  },
  font: {
    displayBold: 'PlayfairDisplay_700Bold',
    displayItalic: 'PlayfairDisplay_400Regular_Italic',
    displayBoldItalic: 'PlayfairDisplay_700Bold_Italic',
    body: 'Inter_400Regular',
    bodyMedium: 'Inter_500Medium',
    bodySemiBold: 'Inter_600SemiBold',
    bodyBold: 'Inter_700Bold',
  },
  shadow: {
    red: {
      shadowColor: '#B91C1C',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 20,
      elevation: 10,
    },
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    },
  },
} as const;

export type Theme = typeof theme;
