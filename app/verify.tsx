import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { reidErrorFor } from '@/lib/auth-errors';
import LogoMark from '@/components/LogoMark';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 60;

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(''));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  // Start with full cooldown — login.tsx just sent a code one route ago.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SEC);
  const inputs = useRef<(TextInput | null)[]>([]);
  const shake = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function attemptVerify(code: string) {
    if (!email || code.length !== OTP_LENGTH || verifying) return;
    setVerifying(true);
    setErrorMsg(null);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    setVerifying(false);
    if (error) {
      shake.value = withSequence(
        withTiming(-8, { duration: 60, easing: Easing.linear }),
        withTiming(8, { duration: 60, easing: Easing.linear }),
        withTiming(-6, { duration: 60, easing: Easing.linear }),
        withTiming(6, { duration: 60, easing: Easing.linear }),
        withTiming(0, { duration: 60, easing: Easing.linear }),
      );
      setDigits(Array(OTP_LENGTH).fill(''));
      setErrorMsg('Wrong code');
      requestAnimationFrame(() => inputs.current[0]?.focus());
      return;
    }
    router.replace('/');
  }

  function handleChange(idx: number, raw: string) {
    const cleaned = raw.replace(/\D/g, '');
    if (errorMsg) setErrorMsg(null);

    if (cleaned.length > 1) {
      // iOS one-time-code autofill or paste — distribute across boxes.
      const next = [...digits];
      for (let i = 0; i < cleaned.length && idx + i < OTP_LENGTH; i++) {
        next[idx + i] = cleaned[i];
      }
      setDigits(next);
      const lastWritten = Math.min(idx + cleaned.length - 1, OTP_LENGTH - 1);
      const focusTarget = Math.min(lastWritten + 1, OTP_LENGTH - 1);
      inputs.current[focusTarget]?.focus();
      const code = next.join('');
      if (code.length === OTP_LENGTH && next.every((d) => d.length === 1)) {
        void attemptVerify(code);
      }
      return;
    }

    const single = cleaned.slice(-1);
    const next = [...digits];
    next[idx] = single;
    setDigits(next);

    if (single && idx < OTP_LENGTH - 1) {
      inputs.current[idx + 1]?.focus();
    }
    if (idx === OTP_LENGTH - 1 && single) {
      const code = next.join('');
      if (code.length === OTP_LENGTH && next.every((d) => d.length === 1)) {
        void attemptVerify(code);
      }
    }
  }

  function handleKeyPress(idx: number, key: string) {
    if (key === 'Backspace' && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending || !email) return;
    setResending(true);
    setErrorMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setResending(false);
    if (error) {
      setErrorMsg(reidErrorFor(error.message));
      return;
    }
    setDigits(Array(OTP_LENGTH).fill(''));
    inputs.current[0]?.focus();
    setCooldown(RESEND_COOLDOWN_SEC);
  }

  if (!email) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.bgDark,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Text
          style={{
            color: Colors.textPrimary,
            fontFamily: Fonts.serifItalic,
            fontSize: 20,
            textAlign: 'center',
          }}
        >
          Something went wrong.
        </Text>
        <Pressable onPress={() => router.replace('/login')} style={{ marginTop: 16 }}>
          <Text
            style={{
              color: Colors.textPrimary,
              fontFamily: Fonts.sansMedium,
              fontSize: 14,
              textDecorationLine: 'underline',
            }}
          >
            Back to login
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: Colors.bgDark }}
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        <View style={{ width: '100%', maxWidth: 360, alignItems: 'center' }}>
          <LogoMark size={48} />

          <Text
            style={{
              fontFamily: Fonts.serifRegular,
              color: Colors.textPrimary,
              fontSize: 28,
              letterSpacing: -0.56,
              lineHeight: 34,
              marginTop: 18,
              textAlign: 'center',
            }}
          >
            Check your email.
          </Text>

          <Text
            style={{
              fontFamily: Fonts.sansRegular,
              fontSize: 14,
              color: Colors.textDim,
              lineHeight: 21,
              marginTop: 8,
              textAlign: 'center',
            }}
          >
            We sent a 6-digit code to{' '}
            <Text style={{ color: '#C8D5E3' }}>{email}</Text>.
          </Text>

          <Animated.View
            style={[
              { flexDirection: 'row', gap: 8, marginTop: 26 },
              shakeStyle,
            ]}
          >
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(r) => {
                  inputs.current[i] = r;
                }}
                value={d}
                onChangeText={(t) => handleChange(i, t)}
                onKeyPress={(e) => handleKeyPress(i, e.nativeEvent.key)}
                keyboardType="number-pad"
                inputMode="numeric"
                editable={!verifying}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                returnKeyType="done"
                style={{
                  width: 44,
                  height: 56,
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: errorMsg
                    ? '#F87171'
                    : d
                      ? Colors.accent
                      : 'rgba(122,144,168,0.25)',
                  textAlign: 'center',
                  fontSize: 22,
                  color: Colors.textPrimary,
                  fontFamily: Fonts.serifRegular,
                  backgroundColor: 'transparent',
                }}
              />
            ))}
          </Animated.View>

          {errorMsg && (
            <Text
              style={{
                marginTop: 14,
                fontFamily: Fonts.sansRegular,
                fontSize: 13,
                color: '#F87171',
              }}
            >
              {errorMsg}
            </Text>
          )}

          <Pressable
            onPress={handleResend}
            disabled={cooldown > 0 || resending}
            hitSlop={8}
            style={{ marginTop: 28 }}
          >
            <Text
              style={{
                fontFamily: Fonts.sansRegular,
                fontSize: 13,
                color:
                  cooldown > 0 || resending ? Colors.textDim : Colors.textPrimary,
                textDecorationLine:
                  cooldown > 0 || resending ? 'none' : 'underline',
              }}
            >
              {resending
                ? 'Sending…'
                : cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : 'Resend code'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace('/login')}
            hitSlop={8}
            style={{ marginTop: 14 }}
          >
            <Text
              style={{
                fontFamily: Fonts.sansRegular,
                fontSize: 12,
                color: Colors.textDim,
                textDecorationLine: 'underline',
              }}
            >
              Use a different email
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
