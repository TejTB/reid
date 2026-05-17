import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowUp } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { reidFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { C, F, R, S } from '@/constants/theme';
import LogoMark from '@/components/LogoMark';

type Msg = { role: 'user' | 'assistant'; content: string };

const VOICE_PREF_KEY = 'reid_voice_enabled';
const LAST_SEEN_KEY = 'reid:lastSeenReidMessageAt';

let cachedSessionId: string | null = null;

// Base64-encode the audio ArrayBuffer for FileSystem.writeAsStringAsync. We
// avoid `Buffer.from(...).toString("base64")` because the Hermes runtime
// doesn't ship Buffer by default; instead we chunk-encode via btoa.
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(binary);
  return '';
}

function formatLastSession(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'First session.';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'First session.';
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  const hh = then.getHours();
  const mm = then.getMinutes().toString().padStart(2, '0');
  const ampm = hh >= 12 ? 'pm' : 'am';
  const h12 = ((hh + 11) % 12) + 1;
  const time = `${h12}:${mm}${ampm}`;
  if (sameDay) return `Last session: Today ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const isYesterday =
    then.getFullYear() === y.getFullYear() &&
    then.getMonth() === y.getMonth() &&
    then.getDate() === y.getDate();
  if (isYesterday) return `Last session: Yesterday ${time}`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Last session: ${months[then.getMonth()]} ${then.getDate()} ${time}`;
}

// One assistant turn that fades + translates upward on first render.
function ReidBubble({ text }: { text: string }) {
  const opacity = useSharedValue(0);
  const ty = useSharedValue(8);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
    ty.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) });
  }, [opacity, ty]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.View style={[{ marginTop: S.sm, marginBottom: S.md, paddingRight: 24 }, style]}>
      <Text
        style={{
          fontFamily: F.serifItalic,
          fontSize: 20,
          lineHeight: 28,
          color: C.text,
        }}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

function TypingDots() {
  const d1 = useSharedValue(0.4);
  const d2 = useSharedValue(0.4);
  const d3 = useSharedValue(0.4);

  useEffect(() => {
    const cfg = { duration: 400, easing: Easing.inOut(Easing.ease) };
    d1.value = withRepeat(withSequence(withTiming(1, cfg), withTiming(0.4, cfg)), -1, false);
    d2.value = withDelay(150, withRepeat(withSequence(withTiming(1, cfg), withTiming(0.4, cfg)), -1, false));
    d3.value = withDelay(300, withRepeat(withSequence(withTiming(1, cfg), withTiming(0.4, cfg)), -1, false));
  }, [d1, d2, d3]);

  const s1 = useAnimatedStyle(() => ({ opacity: d1.value }));
  const s2 = useAnimatedStyle(() => ({ opacity: d2.value }));
  const s3 = useAnimatedStyle(() => ({ opacity: d3.value }));
  const baseDot = {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.muted,
    marginRight: 8,
  } as const;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: S.sm,
        marginBottom: S.md,
        paddingRight: 24,
      }}
    >
      <Animated.View style={[baseDot, s1]} />
      <Animated.View style={[baseDot, s2]} />
      <Animated.View style={[baseDot, s3]} />
    </View>
  );
}

function Waveform() {
  const v1 = useSharedValue(0.3);
  const v2 = useSharedValue(0.3);
  const v3 = useSharedValue(0.3);

  useEffect(() => {
    const cfg = { duration: 280, easing: Easing.inOut(Easing.ease) };
    v1.value = withRepeat(withSequence(withTiming(1, cfg), withTiming(0.3, cfg)), -1, false);
    v2.value = withDelay(90, withRepeat(withSequence(withTiming(1, cfg), withTiming(0.3, cfg)), -1, false));
    v3.value = withDelay(180, withRepeat(withSequence(withTiming(1, cfg), withTiming(0.3, cfg)), -1, false));
  }, [v1, v2, v3]);

  const s1 = useAnimatedStyle(() => ({ transform: [{ scaleY: v1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ scaleY: v2.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ scaleY: v3.value }] }));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 12 }}>
      <Animated.View
        style={[{ width: 2, height: 12, backgroundColor: C.text, borderRadius: 1 }, s1]}
      />
      <Animated.View
        style={[{ width: 2, height: 12, backgroundColor: C.text, borderRadius: 1 }, s2]}
      />
      <Animated.View
        style={[{ width: 2, height: 12, backgroundColor: C.text, borderRadius: 1 }, s3]}
      />
    </View>
  );
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [waveformActive, setWaveformActive] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [lastSessionAt, setLastSessionAt] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const sessionIdRef = useRef<string | null>(cachedSessionId);
  const lastPlayedRef = useRef<string | null>(null);
  const flatListRef = useRef<FlatList<Msg> | null>(null);

  // Initial data load: subscription_status + last_session_at.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: { session } }, prefRaw] = await Promise.all([
        supabase.auth.getSession(),
        AsyncStorage.getItem(VOICE_PREF_KEY),
      ]);
      if (cancelled) return;
      if (!session) {
        router.replace('/login');
        return;
      }
      const { data: row } = await supabase
        .from('users')
        .select('subscription_status, last_session_at')
        .eq('auth_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      setIsPro(row?.subscription_status === 'pro');
      setLastSessionAt((row?.last_session_at as string | null) ?? null);
      // Voice defaults ON for Pro; off otherwise (free users get a preview
      // when they tap "Hear Reid", not auto-play).
      if (prefRaw === 'false') {
        setVoiceEnabled(false);
      } else {
        setVoiceEnabled(true);
      }
      // Mark Reid messages seen, clearing the tab badge.
      void AsyncStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tear down any playing audio when the screen unmounts.
  useEffect(() => {
    return () => {
      const s = soundRef.current;
      if (s) {
        void s.unloadAsync();
      }
    };
  }, []);

  const playMessage = useCallback(
    async (text: string, preview: boolean) => {
      if (soundRef.current) {
        try {
          await soundRef.current.unloadAsync();
        } catch {
          // Sound may already be unloaded.
        }
        soundRef.current = null;
      }
      setWaveformActive(true);
      try {
        const res = await reidFetch('/api/tts', {
          method: 'POST',
          body: JSON.stringify({ text, preview }),
        });
        if (res.status === 403) {
          setWaveformActive(false);
          // Free user requested full playback — upsell.
          router.push('/upgrade');
          return;
        }
        if (!res.ok) {
          setWaveformActive(false);
          return;
        }
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const base64 = bytesToBase64(bytes);
        const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
        if (!dir) {
          setWaveformActive(false);
          return;
        }
        const uri = `${dir}reid-voice-${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(uri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            setWaveformActive(false);
            void sound.unloadAsync();
            soundRef.current = null;
            // Free users hear the preview, then see the upgrade modal.
            if (preview) {
              router.push('/upgrade');
            }
          }
        });
      } catch {
        setWaveformActive(false);
      }
    },
    [],
  );

  // Pro + voice toggle ON: auto-play each new Reid message exactly once.
  useEffect(() => {
    if (!isPro || !voiceEnabled || isStreaming || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== 'assistant') return;
    if (lastPlayedRef.current === last.content) return;
    lastPlayedRef.current = last.content;
    void playMessage(last.content, false);
  }, [messages, isStreaming, voiceEnabled, isPro, playMessage]);

  async function runReid(seed: Msg[]) {
    setIsStreaming(true);
    setStreamingText('');
    let acc = '';
    try {
      const res = await reidFetch('/api/reid', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'chat',
          sessionId: sessionIdRef.current,
          messages: seed,
        }),
      });
      if (res.status === 429) {
        setIsStreaming(false);
        setMessages((prev) => prev.slice(0, -1));
        Alert.alert('Daily limit reached', 'Upgrade for unlimited sessions.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/upgrade') },
        ]);
        return;
      }
      if (!res.ok) {
        let bodyText = '';
        try { bodyText = (await res.text()).slice(0, 200); } catch {}
        throw new Error(`HTTP ${res.status}${bodyText ? ` — ${bodyText}` : ''}`);
      }
      const sid = res.headers.get('X-Reid-Session-Id') ?? res.headers.get('x-reid-session-id');
      if (sid) {
        sessionIdRef.current = sid;
        cachedSessionId = sid;
      }
      const body = res.body as ReadableStream<Uint8Array> | null | undefined;
      if (body && typeof body.getReader === 'function') {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            acc += decoder.decode(value, { stream: true });
            setStreamingText(acc);
          }
        }
      } else {
        acc = await res.text();
        setStreamingText(acc);
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Something's off on my end. (${detail})` },
      ]);
      setStreamingText('');
      setIsStreaming(false);
      return;
    }
    setMessages((prev) => [...prev, { role: 'assistant', content: acc }]);
    setStreamingText('');
    setIsStreaming(false);
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    const next: Msg[] = [...messages, { role: 'user', content: trimmed }];
    setInput('');
    setMessages(next);
    await runReid(next);
  }

  async function onHearReid() {
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!last) return;
    await playMessage(last.content, !isPro);
  }

  // Auto-scroll to bottom when a new message lands.
  useEffect(() => {
    if (!flatListRef.current) return;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, [messages, streamingText]);

  const visible: Msg[] = [...messages];
  if (streamingText && isStreaming) {
    visible.push({ role: 'assistant', content: streamingText });
  }
  // FlatList inverted: newest first.
  const inverted = [...visible].reverse();

  const lastReid = [...messages].reverse().find((m) => m.role === 'assistant');
  const subtitle = formatLastSession(lastSessionAt);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      style={{ flex: 1, backgroundColor: C.bg }}
    >
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 14,
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.serifReg, fontSize: 18, color: C.text }}>Reid</Text>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted, marginTop: 2 }}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          onPress={onHearReid}
          disabled={!lastReid || waveformActive}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 14,
            borderRadius: R.pill,
            backgroundColor: C.red,
            opacity: !lastReid ? 0.5 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {waveformActive ? (
            <Waveform />
          ) : (
            <Text
              style={{
                fontFamily: F.sansMed,
                fontSize: 13,
                color: C.text,
                letterSpacing: 0.3,
              }}
            >
              Hear Reid
            </Text>
          )}
        </Pressable>
      </View>

      {visible.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
          }}
        >
          <LogoMark size={80} glow />
          <Text
            style={{
              fontFamily: F.serifItalic,
              fontSize: 20,
              color: C.text,
              marginTop: 24,
              textAlign: 'center',
              lineHeight: 28,
            }}
          >
            Your co-founder is ready.
          </Text>
          <Text
            style={{
              fontFamily: F.sans,
              fontSize: 14,
              color: C.muted,
              marginTop: 8,
            }}
          >
            Start talking.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={inverted}
          inverted
          keyExtractor={(_, i) => `m-${visible.length - 1 - i}`}
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 18 }}
          renderItem={({ item }) => {
            if (item.role === 'assistant') {
              return <ReidBubble text={item.content} />;
            }
            return (
              <View style={{ marginTop: S.sm, marginBottom: S.md, alignItems: 'flex-end' }}>
                <View
                  style={{
                    maxWidth: '75%',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.10)',
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                    borderBottomLeftRadius: 16,
                    borderBottomRightRadius: 4,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: F.sans,
                      fontSize: 15,
                      lineHeight: 22,
                      color: C.text,
                    }}
                  >
                    {item.content}
                  </Text>
                </View>
              </View>
            );
          }}
          ListHeaderComponent={isStreaming && !streamingText ? <TypingDots /> : null}
        />
      )}

      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12 + insets.bottom,
          borderTopWidth: 1,
          borderTopColor: C.border,
          backgroundColor: C.surface,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 10,
        }}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!isStreaming}
          placeholder="Say something..."
          placeholderTextColor={C.muted}
          multiline
          style={{
            flex: 1,
            color: C.text,
            fontFamily: F.sans,
            fontSize: 15,
            minHeight: 44,
            maxHeight: 130,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: R.md,
            borderWidth: 1,
            // ONE clean focus transition: idle border → red focus border.
            borderColor: focused ? C.redFocus : C.border,
            backgroundColor: C.bg,
          }}
        />
        <Pressable
          onPress={handleSend}
          disabled={isStreaming || !input.trim()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: C.red,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isStreaming || !input.trim() ? 0.4 : 1,
          }}
        >
          <ArrowUp size={18} color={C.text} strokeWidth={2.4} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
