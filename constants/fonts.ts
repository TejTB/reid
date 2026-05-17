// Backward-compat alias for the legacy `Fonts.*` API. New code should pull
// `F` from `constants/theme.ts` directly.
import { F } from './theme';

export const Fonts = {
  serifRegular: F.serifReg,
  serifItalic: F.serifItalic,
  sansRegular: F.sans,
  sansMedium: F.sansMed,
} as const;
