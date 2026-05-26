/**
 * ReidOrb — the animated centerpiece of the app.
 *
 * A single Skia <Canvas> rendering layered glow, an orbiting particle system,
 * a glassy core sphere and a specular highlight. All motion runs on the UI
 * thread via Reanimated shared/derived values (no React state in the loop), so
 * it holds 60fps. State transitions are eased over 400–600ms with withTiming,
 * and a frame-integrated `phase` gives smooth variable-speed orbiting with no
 * positional jumps when speed changes.
 */
import React, { useEffect, useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  RadialGradient,
  vec,
} from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { theme } from '../../lib/theme';
import { OrbState } from '../../lib/types';

type ReidOrbProps = {
  size?: number;
  state: OrbState;
  style?: StyleProp<ViewStyle>;
};

const PARTICLE_COUNT = 24;
const TWO_PI = Math.PI * 2;

// Per-state animation targets. `speed` is orbit revolutions-driver (radians/sec),
// `glow` scales atmosphere/glow opacity, `coreScale` pulses the core sphere,
// `particleAmp` drives particle opacity + radius "spiral" oscillation and a
// slight orbit-radius expansion.
const STATE_TARGETS: Record<
  OrbState,
  { speed: number; glow: number; coreScale: number; particleAmp: number }
> = {
  // ~8s / rev  → 2π/8 ≈ 0.785 rad/s
  idle: { speed: TWO_PI / 8, glow: 0.45, coreScale: 1.0, particleAmp: 0.35 },
  // ~3s / rev
  listening: { speed: TWO_PI / 3, glow: 0.7, coreScale: 1.12, particleAmp: 0.75 },
  // ~2s / rev
  thinking: { speed: TWO_PI / 2, glow: 0.9, coreScale: 1.06, particleAmp: 1.0 },
  // ~4s / rev
  responding: { speed: TWO_PI / 4, glow: 0.85, coreScale: 1.1, particleAmp: 0.85 },
};

type ParticleSpec = {
  baseAngle: number;
  orbitRadius: number;
  radius: number;
  opacityBase: number;
  dim: boolean;
  spiralPhase: number;
};

export function ReidOrb({ size = 200, state, style }: ReidOrbProps) {
  const canvasSize = size * 2.2;
  const cx = size * 1.1;
  const cy = size * 1.1;

  // Layer radii.
  const atmosphereR = size * 1.1;
  const glowRingR = size * 0.65;
  const coreR = size * 0.28;
  const highlightR = size * 0.07;

  // ── Animation drivers (UI-thread shared values) ──────────────────────────
  const phase = useSharedValue(0); // integrated orbit angle (radians)
  const spiral = useSharedValue(0); // integrated spiral oscillator phase
  const speed = useSharedValue(STATE_TARGETS.idle.speed);
  const glow = useSharedValue(STATE_TARGETS.idle.glow);
  const coreScale = useSharedValue(STATE_TARGETS.idle.coreScale);
  const particleAmp = useSharedValue(STATE_TARGETS.idle.particleAmp);

  // Integrate phase every frame: smooth variable speed, never resets position.
  useFrameCallback((frameInfo) => {
    'worklet';
    const dt = (frameInfo.timeSincePreviousFrame ?? 16) / 1000;
    phase.value += dt * speed.value;
    spiral.value += dt * 2.4; // steady oscillator for the "spiral" breathing
  });

  // Ease drivers toward the new state's targets.
  useEffect(() => {
    const t = STATE_TARGETS[state];
    const cfg = { duration: 500, easing: Easing.inOut(Easing.ease) };
    speed.value = withTiming(t.speed, cfg);
    glow.value = withTiming(t.glow, cfg);
    coreScale.value = withTiming(t.coreScale, cfg);
    particleAmp.value = withTiming(t.particleAmp, cfg);
  }, [state, speed, glow, coreScale, particleAmp]);

  // ── Static particle params (computed once) ───────────────────────────────
  const particles = useMemo<ParticleSpec[]>(() => {
    const list: ParticleSpec[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const dim = i % 2 === 1;
      // orbitRadius varied across size*0.42..0.52
      const orbitRadius = size * (0.42 + (i % 5) * 0.025);
      // particle radius 2..4 alternating
      const radius = 2 + (i % 3);
      list.push({
        baseAngle: (i / PARTICLE_COUNT) * TWO_PI,
        orbitRadius,
        radius,
        opacityBase: dim ? 0.4 : 0.7,
        dim,
        spiralPhase: (i / PARTICLE_COUNT) * TWO_PI,
      });
    }
    return list;
  }, [size]);

  // ── Derived layer values ─────────────────────────────────────────────────
  // Outer atmosphere opacity 0.3↔0.8 driven by glow.
  const atmosphereOpacity = useDerivedValue(() => {
    const breathe = 0.06 * Math.sin(spiral.value * 0.5);
    return Math.min(0.8, Math.max(0.3, glow.value + breathe));
  });

  // Glow ring pulses in all states.
  const glowRingOpacity = useDerivedValue(() => {
    const pulse = 0.5 + 0.5 * Math.sin(spiral.value * 0.8);
    return Math.min(1, glow.value * (0.7 + 0.3 * pulse));
  });

  const coreTransform = useDerivedValue(() => [{ scale: coreScale.value }]);

  return (
    <View
      style={[
        { width: canvasSize, height: canvasSize },
        styles.container,
        style,
      ]}
    >
      <Canvas style={{ width: canvasSize, height: canvasSize }}>
        {/* 1. OUTER ATMOSPHERE */}
        <Circle cx={cx} cy={cy} r={atmosphereR} opacity={atmosphereOpacity}>
          <RadialGradient
            c={vec(cx, cy)}
            r={atmosphereR}
            colors={['rgba(185,28,28,0)', theme.orb.glowOuter]}
            positions={[0.4, 1]}
          />
        </Circle>

        {/* 2. GLOW RING */}
        <Circle cx={cx} cy={cy} r={glowRingR} opacity={glowRingOpacity}>
          <RadialGradient
            c={vec(cx, cy)}
            r={glowRingR}
            colors={[theme.orb.glow, 'rgba(185,28,28,0)']}
            positions={[0, 1]}
          />
        </Circle>

        {/* 3. PARTICLE SYSTEM (24 orbiting particles) */}
        {particles.map((p, i) => (
          <OrbitParticle
            key={i}
            spec={p}
            cx={cx}
            cy={cy}
            phase={phase}
            spiral={spiral}
            particleAmp={particleAmp}
          />
        ))}

        {/* 4. CORE SPHERE (scale-pulses around its center) */}
        <Group origin={vec(cx, cy)} transform={coreTransform}>
          <Circle cx={cx} cy={cy} r={coreR}>
            <RadialGradient
              c={vec(cx - coreR * 0.25, cy - coreR * 0.25)}
              r={coreR * 1.25}
              colors={[theme.orb.bright, theme.orb.inner, theme.orb.core, '#7F1D1D']}
              positions={[0, 0.45, 0.8, 1]}
            />
          </Circle>
        </Group>

        {/* 5. SPECULAR HIGHLIGHT (static glass illusion) */}
        <Circle
          cx={cx - size * 0.1}
          cy={cy - size * 0.1}
          r={highlightR}
          color="rgba(255,255,255,0.18)"
        />
      </Canvas>
    </View>
  );
}

// Single orbiting particle. Reads phase/spiral/particleAmp shared values on the
// UI thread and feeds derived cx/cy/r/opacity straight into Skia props.
function OrbitParticle({
  spec,
  cx,
  cy,
  phase,
  spiral,
  particleAmp,
}: {
  spec: ParticleSpec;
  cx: number;
  cy: number;
  phase: ReturnType<typeof useSharedValue<number>>;
  spiral: ReturnType<typeof useSharedValue<number>>;
  particleAmp: ReturnType<typeof useSharedValue<number>>;
}) {
  const px = useDerivedValue(() => {
    const amp = particleAmp.value;
    const orbit = spec.orbitRadius * (1 + 0.08 * amp);
    return cx + orbit * Math.cos(spec.baseAngle + phase.value);
  });

  const py = useDerivedValue(() => {
    const amp = particleAmp.value;
    const orbit = spec.orbitRadius * (1 + 0.08 * amp);
    return cy + orbit * Math.sin(spec.baseAngle + phase.value);
  });

  // Spiral feel: radius oscillates, weighted by amplitude (strong in thinking).
  const pr = useDerivedValue(() => {
    const amp = particleAmp.value;
    const osc = Math.sin(spiral.value + spec.spiralPhase);
    return Math.max(0.5, spec.radius + amp * 1.6 * osc);
  });

  const pOpacity = useDerivedValue(() => {
    const amp = particleAmp.value;
    const twinkle = 0.85 + 0.15 * Math.sin(spiral.value * 1.3 + spec.spiralPhase);
    return Math.min(1, (spec.opacityBase + amp * 0.25) * twinkle);
  });

  return (
    <Circle
      cx={px}
      cy={py}
      r={pr}
      color={spec.dim ? theme.orb.particleDim : theme.orb.particle}
      opacity={pOpacity}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
