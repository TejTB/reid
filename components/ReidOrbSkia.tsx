// ReidOrbSkia — a volumetric particle-sphere orb rendered with Skia.
//
// Drop-in swappable with components/ReidOrb.tsx. Same public contract:
//   type Props = { state: OrbVisual; amplitude: number; onPress?: () => void }
//
// This is a NATIVE module (@shopify/react-native-skia) behind the USE_SKIA_ORB
// flag in lib/featureFlags.ts. It cannot load in a dev binary built before the
// dependency was added — rebuild the dev client first.
//
// Architecture (all motion on the UI thread, zero per-frame React setState):
//   • useClock()           — UI-thread time source.
//   • stateProgress        — a shared value lerped toward the active state's
//                            target params each frame (smooth transitions).
//   • amp                  — incoming amplitude, smoothed on the UI thread.
//   • useRSXformBuffer     — per-particle scale/rotation/translation, computed
//                            in a worklet → GPU-instanced via <Atlas>.
//   • <Atlas>              — one draw call for all N particles.
//   • Radial-gradient core — glowing deeper-crimson centre bleeding into navy.
//
// Verified against @shopify/react-native-skia 2.2.12 docs (Context7):
// Canvas, Atlas, useTexture, useRSXformBuffer, useClock, RadialGradient,
// BlurMask, Group, interpolateColors.

import { useEffect, useMemo } from "react";
import { Pressable, useWindowDimensions } from "react-native";
import {
  Atlas,
  BlurMask,
  Canvas,
  Circle,
  Fill,
  Group,
  RadialGradient,
  rect,
  Skia,
  useClock,
  useRSXformBuffer,
  useTexture,
  vec,
} from "@shopify/react-native-skia";
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { C } from "@/constants/theme";
import type { OrbVisual } from "@/lib/voice/orbState";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — all tunable constants live here.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  // Layout
  CANVAS: 360, // logical px the orb canvas occupies (square)
  SPHERE_RADIUS: 118, // resting radius of the particle sphere, in px

  // Particles
  //
  // PARTICLE_COUNT is the 60fps ceiling. Atlas is GPU-instanced (one draw call),
  // but the per-frame transform worklet still costs CPU. 600 is a safe start.
  // MUST be profiled on-device: if it can't hold 60fps, REDUCE this — do not
  // ship jank. Range to try: 400 (cheap) … 700 (rich). Above ~700 the worklet
  // loop tends to drop frames on mid-range Android.
  PARTICLE_COUNT: 600,
  PARTICLE_SIZE: 9, // sprite texture size (px); on-screen size scales by depth
  PARTICLE_MIN_SCALE: 0.35, // back-of-sphere particles (smaller / dimmer)
  PARTICLE_MAX_SCALE: 1.15, // front-of-sphere particles (larger / brighter)

  // Colours — the orb's documented core/glow palette. Everything else comes
  // from constants/theme.ts (the design system).
  BG: C.bg, // #0A1628 navy backdrop
  CORE: "#8E1616", // deeper crimson, pushed past the accent
  ACCENT: C.red, // #B91C1C system accent
  HIGHLIGHT: "#E8746B", // warm highlight on front-lit particles
  GLOW: "#8E1616", // soft glow colour bleeding into navy

  // Motion
  ROTATION_SPEED: 0.18, // base sphere spin (rad/s) — gives volume/parallax
  DRIFT_SPEED: 0.9, // per-particle jitter frequency
  BREATH_SPEED: 0.6, // idle breathing frequency (rad/s)
  CORE_BLUR: 28, // glow blur radius
} as const;

// Per-state target parameters. The live `stateProgress` lerps toward whichever
// of these is active, so every transition is smooth.
//   radiusMul   — sphere size multiplier
//   breath      — breathing depth (0..1)
//   ampScale    — how much `amplitude` expands the sphere
//   spin        — rotation-speed multiplier
//   drift       — particle-jitter multiplier
//   brightness  — overall particle/core opacity (0..1)
//   coreT       — core colour blend: 0 = deep crimson, 1 = warm/bright
type StateParams = {
  radiusMul: number;
  breath: number;
  ampScale: number;
  spin: number;
  drift: number;
  brightness: number;
  coreT: number;
};

const STATE_PARAMS: Record<OrbVisual, StateParams> = {
  idle: { radiusMul: 1.0, breath: 1.0, ampScale: 0.0, spin: 1.0, drift: 0.6, brightness: 0.85, coreT: 0.2 },
  listening: { radiusMul: 1.06, breath: 0.4, ampScale: 0.5, spin: 1.2, drift: 1.4, brightness: 1.0, coreT: 0.45 },
  thinking: { radiusMul: 0.82, breath: 0.5, ampScale: 0.0, spin: 0.5, drift: 0.4, brightness: 0.55, coreT: 0.1 },
  speaking: { radiusMul: 1.04, breath: 0.5, ampScale: 0.38, spin: 1.5, drift: 1.6, brightness: 1.0, coreT: 0.7 },
  error: { radiusMul: 0.92, breath: 0.25, ampScale: 0.0, spin: 0.35, drift: 0.25, brightness: 0.5, coreT: 0.05 },
};

type Props = { state: OrbVisual; amplitude: number; onPress?: () => void };

// Deterministic pseudo-random in [0,1) — seeds stable per-particle positions so
// the sphere shape is fixed at mount (only motion is animated).
function rand(seed: number): number {
  "worklet";
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export default function ReidOrbSkia({ state, amplitude, onPress }: Props) {
  const { width } = useWindowDimensions();
  // Fit the canvas to the screen but cap at CONFIG.CANVAS.
  const size = Math.min(CONFIG.CANVAS, width);
  const cx = size / 2;
  const cy = size / 2;

  const clock = useClock();

  // Smoothed amplitude (UI thread). The caller pushes a fresh `amplitude` each
  // render; we ease toward it (in an effect, not during render) so ripples feel
  // organic rather than steppy.
  const amp = useSharedValue(0);
  useEffect(() => {
    amp.value = withTiming(Math.max(0, Math.min(1, amplitude)), {
      duration: 90,
      easing: Easing.out(Easing.quad),
    });
  }, [amplitude, amp]);

  // Each state param is its own eased shared value so transitions are smooth and
  // independent. We retarget them whenever `state` changes — in an effect, never
  // by writing .value during render (which Reanimated warns against).
  const radiusMul = useSharedValue(STATE_PARAMS.idle.radiusMul);
  const breath = useSharedValue(STATE_PARAMS.idle.breath);
  const ampScale = useSharedValue(STATE_PARAMS.idle.ampScale);
  const spin = useSharedValue(STATE_PARAMS.idle.spin);
  const drift = useSharedValue(STATE_PARAMS.idle.drift);
  const brightness = useSharedValue(STATE_PARAMS.idle.brightness);
  const coreT = useSharedValue(STATE_PARAMS.idle.coreT);

  useEffect(() => {
    const p = STATE_PARAMS[state];
    const TRANSITION = { duration: 420, easing: Easing.inOut(Easing.cubic) };
    radiusMul.value = withTiming(p.radiusMul, TRANSITION);
    breath.value = withTiming(p.breath, TRANSITION);
    ampScale.value = withTiming(p.ampScale, TRANSITION);
    spin.value = withTiming(p.spin, TRANSITION);
    drift.value = withTiming(p.drift, TRANSITION);
    brightness.value = withTiming(p.brightness, TRANSITION);
    coreT.value = withTiming(p.coreT, TRANSITION);
  }, [state, radiusMul, breath, ampScale, spin, drift, brightness, coreT]);

  // Stable per-particle seeds: spherical coordinates + colour assignment baked
  // once at mount. We use the classic uniform-on-sphere distribution.
  const particles = useMemo(() => {
    const out: { theta: number; phi: number; jitter: number; warm: number }[] = [];
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
      const u = Math.sin(i * 12.9898) * 43758.5453;
      const r1 = u - Math.floor(u);
      const v = Math.sin(i * 78.233) * 12543.123;
      const r2 = v - Math.floor(v);
      out.push({
        theta: Math.acos(2 * r1 - 1), // polar angle, uniform on sphere
        phi: 2 * Math.PI * r2, // azimuth
        jitter: (Math.sin(i * 3.17) * 0.5 + 0.5) * Math.PI * 2,
        warm: (Math.sin(i * 9.71) * 0.5 + 0.5), // 0..1 → how warm/bright this one is
      });
    }
    return out;
  }, []);

  // The single sprite all particles instance from: a soft radial dot. Built on
  // the UI thread via useTexture (no async drawAsImage round-trip).
  const sprite = CONFIG.PARTICLE_SIZE;
  const texture = useTexture(
    <Group>
      <Circle cx={sprite / 2} cy={sprite / 2} r={sprite / 2} color="white">
        <BlurMask blur={sprite / 4} style="normal" />
      </Circle>
    </Group>,
    { width: sprite, height: sprite },
  );

  // One sprite rect per particle (source rect in the texture — all identical).
  const sprites = useMemo(
    () => particles.map(() => rect(0, 0, sprite, sprite)),
    [particles, sprite],
  );

  // Per-particle colours, baked once. Front-of-sphere bias is applied in the
  // worklet via scale; here we vary crimson → warm-highlight for richness.
  const colors = useMemo(() => {
    const a = hexToRgb(CONFIG.ACCENT);
    const h = hexToRgb(CONFIG.HIGHLIGHT);
    return particles.map((pt) => {
      // Blend ACCENT → HIGHLIGHT by the particle's `warm` factor (biased toward
      // crimson, fewer hot highlights). Atlas wants SkColor[], so build via the
      // Skia.Color factory rather than raw RGBA tuples.
      const t = pt.warm * pt.warm;
      const r = Math.round(lerp(a.r, h.r, t));
      const g = Math.round(lerp(a.g, h.g, t));
      const b = Math.round(lerp(a.b, h.b, t));
      return Skia.Color(`rgb(${r}, ${g}, ${b})`);
    });
  }, [particles]);

  // Per-frame transforms — the heart of the orb. Pure worklet, UI thread.
  const transforms = useRSXformBuffer(CONFIG.PARTICLE_COUNT, (val, i) => {
    "worklet";
    const t = clock.value / 1000;
    const pt = particles[i];

    // Breathing pulse + amplitude expansion.
    const breathe = 1 + breath.value * 0.05 * Math.sin(t * CONFIG.BREATH_SPEED * Math.PI);
    const ampPush = 1 + amp.value * ampScale.value;
    const radius = CONFIG.SPHERE_RADIUS * radiusMul.value * breathe * ampPush;

    // Rotate the sphere around the Y axis for parallax/volume.
    const spinT = t * CONFIG.ROTATION_SPEED * spin.value;
    const phi = pt.phi + spinT;

    // Spherical → cartesian. z is depth (toward viewer = +).
    const sinTheta = Math.sin(pt.theta);
    let x = radius * sinTheta * Math.cos(phi);
    let y = radius * Math.cos(pt.theta);
    const z = radius * sinTheta * Math.sin(phi);

    // Per-particle organic drift.
    const d = drift.value;
    x += Math.sin(t * CONFIG.DRIFT_SPEED + pt.jitter) * 4 * d;
    y += Math.cos(t * CONFIG.DRIFT_SPEED * 1.3 + pt.jitter) * 4 * d;

    // Depth → scale: front particles (z>0) larger, back smaller. Maps z from
    // [-radius, +radius] onto [MIN_SCALE, MAX_SCALE].
    const depth = (z / radius + 1) / 2; // 0 (back) .. 1 (front)
    const scale =
      (CONFIG.PARTICLE_MIN_SCALE +
        depth * (CONFIG.PARTICLE_MAX_SCALE - CONFIG.PARTICLE_MIN_SCALE)) *
      (sprite / sprite); // keep sprite-relative

    // RSXform: (scos, ssin, tx, ty). Slow per-particle spin for sparkle.
    const rot = pt.jitter + t * 0.2 * d;
    const s = scale;
    val.set(
      s * Math.cos(rot),
      s * Math.sin(rot),
      cx + x - (sprite * s) / 2,
      cy + y - (sprite * s) / 2,
    );
  });

  // Overall particle-layer opacity follows brightness (eased per state).
  const layerOpacity = useDerivedValue(() => brightness.value);

  // Core radius gently breathes with the sphere + amplitude.
  const coreRadius = useDerivedValue(() => {
    const t = clock.value / 1000;
    const breathe = 1 + breath.value * 0.06 * Math.sin(t * CONFIG.BREATH_SPEED * Math.PI);
    return CONFIG.SPHERE_RADIUS * 0.62 * radiusMul.value * breathe * (1 + amp.value * ampScale.value * 0.5);
  });

  // Core opacity tracks brightness.
  const coreOpacity = useDerivedValue(() => 0.55 + brightness.value * 0.4);

  // Core gradient colours: deep crimson centre → warm hotspot when energetic,
  // always bleeding to transparent navy at the rim.
  const coreColors = useDerivedValue(() => {
    const center = interpolateRgbWorklet(CONFIG.CORE, CONFIG.HIGHLIGHT, coreT.value);
    const mid = CONFIG.ACCENT;
    return [center, mid, "rgba(10,22,40,0)"];
  });

  return (
    <Pressable
      onPress={onPress}
      hitSlop={24}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Canvas style={{ width: size, height: size }}>
        {/* Navy backdrop so the orb reads as volumetric, not a floating disc. */}
        <Fill color={CONFIG.BG} />

        {/* Glowing crimson core bleeding softly into the navy. */}
        <Group opacity={coreOpacity}>
          <Circle cx={cx} cy={cy} r={coreRadius}>
            <RadialGradient c={vec(cx, cy)} r={CONFIG.SPHERE_RADIUS} colors={coreColors} />
            <BlurMask blur={CONFIG.CORE_BLUR} style="normal" />
          </Circle>
        </Group>

        {/* The particle sphere — one GPU-instanced draw call, additive blend so
            overlapping front particles glow warmer. */}
        <Group opacity={layerOpacity} blendMode="plus">
          <Atlas image={texture} sprites={sprites} transforms={transforms} colors={colors} />
        </Group>
      </Canvas>
    </Pressable>
  );
}

// ── small colour helpers (module scope; the worklet variant is self-contained) ──

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// Worklet-safe rgb interpolation between two hex strings → "rgb(r,g,b)".
function interpolateRgbWorklet(hexA: string, hexB: string, t: number): string {
  "worklet";
  const pa = (s: string, i: number) => parseInt(s.replace("#", "").slice(i, i + 2), 16);
  const r = Math.round(pa(hexA, 0) + (pa(hexB, 0) - pa(hexA, 0)) * t);
  const g = Math.round(pa(hexA, 2) + (pa(hexB, 2) - pa(hexA, 2)) * t);
  const b = Math.round(pa(hexA, 4) + (pa(hexB, 4) - pa(hexA, 4)) * t);
  return `rgb(${r}, ${g}, ${b})`;
}
