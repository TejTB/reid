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
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import LogoMark from '@/components/LogoMark';

function reidErrorFor(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes('rate limit') ||
    m.includes('over_email_send_rate_limit') ||
    m.includes('429') ||
    m.includes('too many')
  ) {
    return 'Too many tries. Wait a minute, then try again.';
  }
  if (
    m.includes('invalid login credentials') ||
    m.includes('invalid email') ||
    m.includes('invalid_email')
  ) {
    return "That email doesn't look right.";
  }
  return "Couldn't send the link. Try again.";
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
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
    const value = email.trim();
    if (!value) return;
    setSubmitting(true);
    setErrorMsg(null);
    // Must match the path Supabase allows in its "Redirect URLs" allowlist.
    // Keep this in sync with app/auth/callback.tsx — Linking.createURL builds
    // `reid://auth/callback` for the configured scheme.
    const redirectTo = Linking.createURL('/auth/callback');
    const { error } = await supabase.auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: redirectTo },
    });
    setSubmitting(false);
    if (error) {
      setErrorMsg(reidErrorFor(error.message));
      return;
    }
    setSentEmail(value);
    setSent(true);
  }

  const disabled = submitting || !email.trim();

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bgDark, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: Colors.bgDark }}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
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

          <View style={{ width: '100%', maxWidth: 340, marginTop: 22, alignItems: 'center' }}>
            {sent ? (
              <View style={{ width: '100%', gap: 14, alignItems: 'center' }}>
                <Text
                  style={{
                    fontFamily: Fonts.serifItalic,
                    color: Colors.textPrimary,
                    fontSize: 22,
                    lineHeight: 31,
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
                    lineHeight: 22,
                    textAlign: 'center',
                  }}
                >
                  We sent a link to <Text style={{ color: '#C8D5E3' }}>{sentEmail}</Text>. Open it from this device and you{"’"}re in.
                </Text>
                <Pressable
                  onPress={() => {
                    setSent(false);
                    setErrorMsg(null);
                  }}
                  hitSlop={8}
                  style={{ marginTop: 4 }}
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
            ) : (
              <View style={{ width: '100%', gap: 18, alignItems: 'center' }}>
                <Text
                  style={{
                    fontFamily: Fonts.serifItalic,
                    color: Colors.textPrimary,
                    fontSize: 18,
                    lineHeight: 27,
                    textAlign: 'center',
                  }}
                >
                  Enter your email.{'\n'}We{"’"}ll send you a link.
                </Text>

                <View style={{ width: '100%', gap: 12 }}>
                  <TextInput
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    keyboardType="email-address"
                    editable={!submitting}
                    placeholder=""
                    placeholderTextColor={Colors.textDim}
                    style={{
                      backgroundColor: 'transparent',
                      borderRadius: 9,
                      paddingHorizontal: 14,
                      height: 48,
                      fontSize: 15,
                      color: Colors.textPrimary,
                      fontFamily: Fonts.sansRegular,
                      borderWidth: 1,
                      borderColor: focused ? Colors.accent : 'rgba(122,144,168,0.25)',
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
                      {submitting ? 'Sending…' : 'Send link →'}
                    </Text>
                  </Pressable>
                </View>

                <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(58,80,112,0.5)' }} />
                  <Text
                    style={{
                      fontFamily: Fonts.sansRegular,
                      fontSize: 12,
                      color: '#3A5070',
                      letterSpacing: 0.48,
                    }}
                  >
                    or
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(58,80,112,0.5)' }} />
                </View>

                <Text
                  style={{
                    fontFamily: Fonts.sansRegular,
                    fontSize: 12,
                    color: Colors.textDim,
                    lineHeight: 19,
                    textAlign: 'center',
                  }}
                >
                  New here? Same link. Your first session is free.
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
