// Backward-compat alias for the legacy `Colors.*` API. New code should pull
// `C` from `constants/theme.ts` directly.
import { C } from './theme';

export const Colors = {
  bgDark: C.bg,
  bgCard: C.surface,
  textPrimary: C.text,
  textDim: C.muted,
  accent: C.red,
  border: C.border,
} as const;
