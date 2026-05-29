import type * as React from "react";
import ReidOrb from "@/components/ReidOrb";
import { USE_SKIA_ORB } from "@/lib/featureFlags";
import type { OrbVisual } from "@/lib/voice/orbState";

type Props = { state: OrbVisual; amplitude: number; onPress?: () => void };

// The Skia orb is a NATIVE module. We load it ONLY when USE_SKIA_ORB is on, via
// require() — a static `import` would evaluate @shopify/react-native-skia at
// bundle time and crash any dev binary that wasn't rebuilt with Skia (i.e. the
// current one). With the flag off, the require never runs and the existing
// build keeps working over Metro. Flip the flag after an EAS dev-client rebuild
// that bundles @shopify/react-native-skia.
const SkiaOrb: React.ComponentType<Props> | null = USE_SKIA_ORB
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("@/components/ReidOrbSkia").default as React.ComponentType<Props>)
  : null;

/** The orb. Renders the immersive Skia particle sphere when enabled+available,
 *  otherwise the Reanimated fallback. Same contract either way. */
export default function Orb(props: Props) {
  const Impl = SkiaOrb ?? ReidOrb;
  return <Impl {...props} />;
}
