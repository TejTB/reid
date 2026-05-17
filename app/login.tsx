import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import LogoMark from '@/components/LogoMark';
import { reidErrorFor } from '@/lib/auth-errors';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session) {
        router.replace('/');
      } else {
        setChecking(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit() {
    if (submitting) return;
    const e = email.trim();
    const p = password;
    if (!e || !p) return;
    setSubmitting(true);
    setErrorMsg(null);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({
        email: e,
        password: p,
      });
      setSubmitting(false);
      if (error) {
        setErrorMsg(reidErrorFor(error.message));
        return;
      }
      router.replace('/');
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: e,
      password: p,
    });
    setSubmitting(false);
    if (error) {
      setErrorMsg(reidErrorFor(error.message));
      return;
    }
    if (!data.session) {
      // Supabase project has email confirmation enabled.
      setErrorMsg('Check your inbox to confirm your account first.');
      return;
    }
    router.replace('/');
  }

  function toggleMode() {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    setErrorMsg(null);
  }

  const disabled = submitting || !email.trim() || !password;
  const headline =
    mode === 'signin' ? 'Welcome back.' : 'Create your account.';
  const primaryLabel =
    mode === 'signin'
      ? submitting
        ? 'Signing in…'
        : 'Sign in'
      : submitting
        ? 'Creating account…'
        : 'Create account';
  const toggleLabel =
    mode === 'signin'
      ? 'New here? Create account'
      : 'Already have an account? Sign in';

  if (checking) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.bgDark,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={Colors.accent} />
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
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <View style={{ width: '100%', maxWidth: 360, alignItems: 'center' }}>
          <LogoMark size={48} />

          <Text
            style={{
              fontFamily: Fonts.serifRegular,
              color: Colors.textPrimary,
              fontSize: 34,
              letterSpacing: -0.68,
              lineHeight: 39,
              marginTop: 20,
              textAlign: 'center',
            }}
          >
            Reid
          </Text>

          <Text
            style={{
              fontFamily: Fonts.serifItalic,
              color: Colors.textPrimary,
              fontSize: 18,
              lineHeight: 27,
              marginTop: 14,
              textAlign: 'center',
            }}
          >
            {headline}
          </Text>

          <View
            style={{
              width: '100%',
              maxWidth: 340,
              marginTop: 22,
              gap: 12,
            }}
          >
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (errorMsg) setErrorMsg(null);
              }}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              editable={!submitting}
              placeholder="Email"
              placeholderTextColor={Colors.textDim}
              returnKeyType="next"
              style={{
                backgroundColor: 'transparent',
                borderRadius: 9,
                paddingHorizontal: 14,
                height: 48,
                fontSize: 15,
                color: Colors.textPrimary,
                fontFamily: Fonts.sansRegular,
                borderWidth: 1,
                borderColor: emailFocused
                  ? Colors.accent
                  : 'rgba(122,144,168,0.25)',
                width: '100%',
              }}
            />

            <TextInput
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (errorMsg) setErrorMsg(null);
              }}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={
                mode === 'signin' ? 'current-password' : 'new-password'
              }
              secureTextEntry
              editable={!submitting}
              placeholder="Password"
              placeholderTextColor={Colors.textDim}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              style={{
                backgroundColor: 'transparent',
                borderRadius: 9,
                paddingHorizontal: 14,
                height: 48,
                fontSize: 15,
                color: Colors.textPrimary,
                fontFamily: Fonts.sansRegular,
                borderWidth: 1,
                borderColor: passwordFocused
                  ? Colors.accent
                  : 'rgba(122,144,168,0.25)',
                width: '100%',
              }}
            />

            {errorMsg && (
              <Text
                style={{
                  fontFamily: Fonts.sansRegular,
                  fontSize: 13,
                  color: '#F87171',
                }}
              >
                {errorMsg}
              </Text>
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={disabled}
              style={{
                height: 46,
                borderRadius: 9,
                backgroundColor: Colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: disabled ? 0.5 : 1,
                width: '100%',
                marginTop: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: Fonts.sansMedium,
                  fontSize: 13,
                  color: Colors.textPrimary,
                  letterSpacing: 0.52,
                }}
              >
                {primaryLabel}
              </Text>
            </Pressable>

            <Pressable onPress={toggleMode} hitSlop={8} style={{ marginTop: 6 }}>
              <Text
                style={{
                  fontFamily: Fonts.sansRegular,
                  fontSize: 13,
                  color: Colors.textDim,
                  textAlign: 'center',
                  textDecorationLine: 'underline',
                }}
              >
                {toggleLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
