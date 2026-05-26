import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { theme } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { GlowCard } from '../../components/cards/GlowCard';
import { ReidLogo } from '../../components/shared/ReidLogo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUp() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (loading) return;
    Haptics.selectionAsync().catch(() => {});
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }
    if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await signUp(trimmedName, trimmedEmail, password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Root layout handles navigation once auth state changes.
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <ReidLogo size={56} />
            <Text style={styles.subtitle}>Your co-founder is waiting.</Text>
          </View>

          <GlowCard style={styles.card}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={theme.text.placeholder}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="name"
              returnKeyType="next"
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={theme.text.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              returnKeyType="next"
              editable={!loading}
            />
            <View style={styles.passwordWrap}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={theme.text.placeholder}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
                editable={!loading}
              />
              <Pressable
                style={({ pressed }) => [styles.eyeButton, pressed && styles.pressed]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setShowPassword((s) => !s);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color={theme.text.dim}
                />
              </Pressable>
            </View>
          </GlowCard>

          <Pressable
            style={({ pressed }) => [
              styles.cta,
              loading && styles.ctaDisabled,
              pressed && !loading && styles.pressed,
            ]}
            onPress={handleSubmit}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Create account</Text>
            )}
          </Pressable>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [styles.switchWrap, pressed && styles.pressed]}
            onPress={() => router.replace('/auth/login')}
            accessibilityRole="link"
          >
            <Text style={styles.switchText}>Already have an account? Sign in</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.bg.primary,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  header: {
    flex: 1,
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: theme.spacing.sm,
  },
  subtitle: {
    fontFamily: theme.font.displayItalic,
    color: theme.text.secondary,
    fontSize: 18,
    textAlign: 'center',
    marginTop: 12,
  },
  card: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    marginTop: theme.spacing.xl,
  },
  input: {
    height: 54,
    backgroundColor: theme.bg.input,
    borderWidth: 1,
    borderColor: theme.border.default,
    borderRadius: theme.radius.md,
    color: theme.text.primary,
    paddingHorizontal: theme.spacing.md,
    fontFamily: theme.font.body,
    fontSize: 16,
  },
  passwordWrap: {
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: theme.spacing.md,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cta: {
    height: 54,
    width: '100%',
    marginTop: theme.spacing.md,
    backgroundColor: theme.accent.red,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.red,
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaText: {
    color: theme.text.primary,
    fontFamily: theme.font.bodySemiBold,
    fontSize: 16,
  },
  error: {
    color: theme.accent.red,
    fontFamily: theme.font.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  switchWrap: {
    marginTop: theme.spacing.lg,
    alignItems: 'center',
  },
  switchText: {
    fontFamily: theme.font.body,
    color: theme.text.dim,
    fontSize: 14,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
