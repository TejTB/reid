// Feature flags for Reid native.
//
// Keep this dead-simple: plain boolean consts, no env plumbing. Flip a flag in
// source and rebuild.

// Skia particle orb (components/ReidOrbSkia.tsx). This is a NATIVE module
// (@shopify/react-native-skia) — it cannot load in a dev binary that was built
// before the dependency was added. Leave this `false` until an EAS dev-client
// rebuild that includes @shopify/react-native-skia has been installed on the
// device, then flip to `true`.
export const USE_SKIA_ORB = false;
