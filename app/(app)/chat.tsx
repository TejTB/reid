import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  withSpring,
  Easing,
  FadeInUp,
  FadeInRight,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowUp, Play, AudioLines } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { reidFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { C, F, R } from '@/constants/theme';
import ReidThinking from '@/components/ReidThinking';
import type { Msg } from '@/lib/conversationStore';
import * as convo from '@/lib/conversationStore';
import { useConversation } from '@/hooks/useConversation';
import { stripReidStream } from '@/lib/voice/strip';

const VOICE_PREF_KEY = 'reid_voice_enabled';
const LAST_SEEN_KEY = 'reid:lastSeenReidMessageAt';
// Persists "Reid spoke first" per-user so the opener doesn't double-fire on
// reload. TODO: when a real conversation_history table exists in Supabase,
// migrate the opener into that table and remove this local flag.
const OPENING_SENT_KEY = 'reid:openingSent';
const OPENING_LINE = "I've been waiting. What are you building?";

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

// Animated waveform that replaces the play icon while audio is playing.
// Three red bars, staggered, opacity 0.8.
function Waveform() {
  const v1 = useSharedValue(0.25);
  const v2 = useSharedValue(0.25);
  const v3 = useSharedValue(0.25);

  useEffect(() => {
    const cfg = { duration: 320, easing: Easing.inOut(Easing.ease) };
    v1.value = withRepeat(
      withSequence(withTiming(1, cfg), withTiming(0.25, cfg)),
      -1,
      false,
    );
    v2.value = withDelay(
      150,
      withRepeat(withSequence(withTiming(1, cfg), withTiming(0.25, cfg)), -1, false),
    );
    v3.value = withDelay(
      300,
      withRepeat(withSequence(withTiming(1, cfg), withTiming(0.25, cfg)), -1, false),
    );
  }, [v1, v2, v3]);

  // Heights animate between 4 and 16px via scaleY on a 16px base.
  const s1 = useAnimatedStyle(() => ({ transform: [{ scaleY: v1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ scaleY: v2.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ scaleY: v3.value }] }));
  const bar = {
    width: 2,
    height: 16,
    backgroundColor: C.red,
    borderRadius: 1,
    opacity: 0.8,
  } as const;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 16 }}>
      <Animated.View style={[bar, s1]} />
      <Animated.View style={[bar, s2]} />
      <Animated.View style={[bar, s3]} />
    </View>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <Animated.View
      entering={FadeInRight.duration(250).easing(Easing.out(Easing.cubic))}
      style={{
        alignSelf: 'flex-end',
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        borderRadius: 20,
        borderBottomRightRadius: 4,
        paddingHorizontal: 16,
        paddingVertical: 12,
        maxWidth: '78%',
        marginBottom: 16,
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
        {text}
      </Text>
    </Animated.View>
  );
}

function ReidBubble({ text }: { text: string }) {
  return (
    <Animated.View
      entering={FadeInUp.duration(350).easing(Easing.out(Easing.cubic))}
      style={{
        alignSelf: 'flex-start',
        paddingRight: 24,
        marginBottom: 20,
      }}
    >
      <Text
        style={{
          fontFamily: F.serif,
          fontSize: 21,
          lineHeight: 30,
          color: C.text,
        }}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

// Send button that scales on press via Reanimated spring.
function SendButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled: boolean;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      onPressIn={() => {
        if (disabled) return;
        scale.value = withSpring(0.88, { damping: 12, stiffness: 280 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 10, stiffness: 220 });
      }}
      disabled={disabled}
      style={{ flexShrink: 0 }}
    >
      <Animated.View
        style={[
          {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: C.red,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.3 : 1,
          },
          style,
        ]}
      >
        <ArrowUp size={20} color="#FFFFFF" strokeWidth={2.4} />
      </Animated.View>
    </Pressable>
  );
}

type ChatItem =
  | { kind: 'msg'; id: string; msg: Msg }
  | { kind: 'thinking'; id: string; lastUser: string };

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { messages } = useConversation();
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  // Voice auto-play preference still applies for Pro users with new Reid
  // replies. The "Hear Reid" button works regardless.
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [waveformActive, setWaveformActive] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [lastSessionAt, setLastSessionAt] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const lastPlayedRef = useRef<string | null>(null);
  const flatListRef = useRef<FlatList<ChatItem> | null>(null);

  // Initial data load: subscription_status + last_session_at + opener.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: { session } }, prefRaw, openingSent] = await Promise.all([
        supabase.auth.getSession(),
        AsyncStorage.getItem(VOICE_PREF_KEY),
        AsyncStorage.getItem(OPENING_SENT_KEY),
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
      if (prefRaw === 'false') setVoiceEnabled(false);
      else setVoiceEnabled(true);

      // Reid speaks first. We only inject the opener on a fresh thread.
      // TODO: when a Supabase conversation_history / messages table exists,
      // persist this message there (with role: 'assistant') and load history
      // here instead of relying on AsyncStorage's `OPENING_SENT_KEY`.
      if (convo.getSnapshot().messages.length === 0) {
        convo.setMessages([{ role: 'assistant', content: OPENING_LINE }]);
        if (!openingSent) {
          void AsyncStorage.setItem(OPENING_SENT_KEY, new Date().toISOString());
        }
      }

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
        // Free users get only a preview (first 12 words). We trim client-side
        // as well, in case `preview` flag is ignored server-side.
        // TODO: confirm exact response shape of /api/tts in reid-app — this
        // path supports both raw audio bytes and `{ audioUrl }` JSON.
        const previewText = preview
          ? text.split(/\s+/).slice(0, 12).join(' ')
          : text;
        const res = await reidFetch('/api/tts', {
          method: 'POST',
          body: JSON.stringify({ text: previewText, preview }),
        });
        if (res.status === 403) {
          setWaveformActive(false);
          router.push('/upgrade');
          return;
        }
        if (!res.ok) {
          setWaveformActive(false);
          return;
        }

        // Two known response shapes from /api/tts:
        //   1. octet-stream raw audio bytes
        //   2. JSON `{ audioUrl: string }`
        const contentType = (
          res.headers.get('content-type') ?? res.headers.get('Content-Type') ?? ''
        ).toLowerCase();

        let uri: string | null = null;
        if (contentType.includes('application/json')) {
          const data = (await res.json()) as { audioUrl?: string };
          if (!data?.audioUrl) {
            setWaveformActive(false);
            return;
          }
          uri = data.audioUrl;
        } else {
          const buf = await res.arrayBuffer();
          const bytes = new Uint8Array(buf);
          const base64 = bytesToBase64(bytes);
          const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
          if (!dir) {
            setWaveformActive(false);
            return;
          }
          // Stable filename per the spec ("reid_voice.mp3"); overwriting is
          // fine because we unload the previous Sound first.
          uri = `${dir}reid_voice.mp3`;
          await FileSystem.writeAsStringAsync(uri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }

        if (!uri) {
          setWaveformActive(false);
          return;
        }

        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            setWaveformActive(false);
            void sound.unloadAsync();
            soundRef.current = null;
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
          sessionId: convo.getSnapshot().sessionId,
          messages: seed,
        }),
      });
      if (res.status === 429) {
        setIsStreaming(false);
        convo.dropLast();
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
        convo.setSessionId(sid);
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
            setStreamingText(stripReidStream(acc));
          }
        }
      } else {
        acc = await res.text();
        setStreamingText(stripReidStream(acc));
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      convo.append({ role: 'assistant', content: `Something's off on my end. (${detail})` });
      setStreamingText('');
      setIsStreaming(false);
      return;
    }
    convo.append({ role: 'assistant', content: stripReidStream(acc) });
    setStreamingText('');
    setIsStreaming(false);
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    convo.append({ role: 'user', content: trimmed });
    await runReid(convo.getSnapshot().messages);
  }

  async function onHearReid() {
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!last) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await playMessage(last.content, !isPro);
  }

  // Build the FlatList feed in chronological order (oldest → newest) so the
  // `flex-end` contentContainerStyle pushes content to the bottom on light
  // conversations and the input never sits on top of a void.
  const items: ChatItem[] = useMemo(() => {
    const arr: ChatItem[] = messages.map((m, i) => ({
      kind: 'msg',
      id: `m-${i}-${m.role}`,
      msg: m,
    }));
    if (isStreaming) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      if (streamingText) {
        // We have tokens — show partial Reid reply instead of the thinking dot.
        arr.push({
          kind: 'msg',
          id: `streaming-${messages.length}`,
          msg: { role: 'assistant', content: streamingText },
        });
      } else {
        arr.push({
          kind: 'thinking',
          id: `thinking-${messages.length}`,
          lastUser: lastUser?.content ?? '',
        });
      }
    }
    return arr;
  }, [messages, isStreaming, streamingText]);

  // Auto-scroll to the new tail on every change.
  useEffect(() => {
    if (!flatListRef.current) return;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
  }, [items.length, streamingText]);

  const lastReid = [...messages].reverse().find((m) => m.role === 'assistant');
  const subtitle = formatLastSession(lastSessionAt);
  const canSend = input.trim().length > 0 && !isStreaming;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
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
        <Pressable onPress={() => router.push('/voice' as any)} hitSlop={12} style={{ marginRight: 14 }}>
          <AudioLines size={24} color={C.muted} />
        </Pressable>
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
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: R.pill,
            borderWidth: 1,
            borderColor: C.red,
            opacity: !lastReid ? 0.5 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {waveformActive ? (
            <Waveform />
          ) : (
            <>
              <Play size={12} color={C.red} fill={C.red} strokeWidth={2} />
              <Text
                style={{
                  fontFamily: F.sansMed,
                  fontSize: 12,
                  color: C.red,
                  letterSpacing: 0.8,
                }}
              >
                Hear Reid
              </Text>
            </>
          )}
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={(item) => item.id}
        // flex-end pushes content to the bottom so the first Reid message
        // sits just above the input bar — no top-anchored void.
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-end',
          paddingTop: 24,
          paddingHorizontal: 20,
          paddingBottom: 16,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
        renderItem={({ item }) => {
          if (item.kind === 'thinking') {
            return <ReidThinking lastUserMessage={item.lastUser} />;
          }
          if (item.msg.role === 'assistant') {
            return <ReidBubble text={item.msg.content} />;
          }
          return <UserBubble text={item.msg.content} />;
        }}
      />

      <View
        style={{
          backgroundColor: C.surface,
          borderTopWidth: 1,
          borderTopColor: C.border,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 12,
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
          scrollEnabled
          style={{
            flex: 1,
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: 20,
            borderWidth: 1,
            // Single border, no outer wrapper. Idle → red focus.
            borderColor: focused ? C.redFocus : 'rgba(255,255,255,0.08)',
            paddingHorizontal: 16,
            paddingVertical: 10,
            fontSize: 15,
            fontFamily: F.sans,
            color: C.text,
            maxHeight: 100,
          }}
        />
        <SendButton onPress={handleSend} disabled={!canSend} />
      </View>
    </KeyboardAvoidingView>
  );
}
