import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Volume2 } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { reidFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';

type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_SESSION_KEY = 'reid:chatSessionId';
let cachedSessionId: string | null = null;

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(binary);
  const Buf = (globalThis as { Buffer?: { from(input: string, enc?: string): { toString(enc: string): string } } }).Buffer;
  if (Buf) return Buf.from(binary, 'binary').toString('base64');
  return '';
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [waveformActive, setWaveformActive] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [lastSessionAt, setLastSessionAt] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const sessionIdRef = useRef<string | null>(cachedSessionId);
  const bar1 = useRef(new Animated.Value(0.3)).current;
  const bar2 = useRef(new Animated.Value(0.3)).current;
  const bar3 = useRef(new Animated.Value(0.3)).current;
  const bar4 = useRef(new Animated.Value(0.3)).current;
  const bar5 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) router.replace('/login');
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
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      const s = soundRef.current;
      if (s) {
        void s.unloadAsync();
      }
    };
  }, []);

  useEffect(() => {
    if (!waveformActive) {
      [bar1, bar2, bar3, bar4, bar5].forEach((b) => b.setValue(0.3));
      return;
    }
    const loops = [bar1, bar2, bar3, bar4, bar5].map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 1, duration: 400, delay: i * 80, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(b, { toValue: 0.3, duration: 400, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
    };
  }, [waveformActive, bar1, bar2, bar3, bar4, bar5]);

  async function playMessage(text: string) {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {
      }
      soundRef.current = null;
    }
    setWaveformActive(true);
    try {
      const res = await reidFetch('/api/voice', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      if (res.status === 403) {
        setVoiceEnabled(false);
        setWaveformActive(false);
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
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          setWaveformActive(false);
          void sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch {
      setWaveformActive(false);
    }
  }

  useEffect(() => {
    if (!voiceEnabled || isStreaming || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== 'assistant') return;
    void playMessage(last.content);
  }, [messages, isStreaming, voiceEnabled]);

  async function runReid(seed: Msg[]) {
    setIsStreaming(true);
    setStreamingText('');
    let acc = '';
    let resolvedSessionId: string | null = sessionIdRef.current;
    try {
      const res = await reidFetch('/api/reid', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'chat',
          sessionId: resolvedSessionId,
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
        throw new Error(`reid ${res.status}`);
      }
      const sid = res.headers.get('X-Reid-Session-Id') ?? res.headers.get('x-reid-session-id');
      if (sid) {
        resolvedSessionId = sid;
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
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Something's off on my end. Try again." },
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

  function onVoiceToggle() {
    if (!isPro) {
      Alert.alert('Reid Pro required', 'Hear Reid speak responses aloud with Pro.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/upgrade') },
      ]);
      return;
    }
    setVoiceEnabled((v) => !v);
  }

  void CHAT_SESSION_KEY;

  const visible: Msg[] = [...messages];
  if (streamingText && isStreaming) {
    visible.push({ role: 'assistant', content: streamingText });
  }
  const inverted = [...visible].reverse();

  const subtitle = lastSessionAt ? 'Continuing the conversation.' : 'First session.';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: Colors.bgDark }}
    >
      <View
        style={{
          paddingTop: 18,
          paddingHorizontal: 22,
          paddingBottom: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        }}
      >
        <Text style={{ fontFamily: Fonts.serifItalic, fontSize: 19, color: Colors.textPrimary }}>Reid</Text>
        <Text style={{ fontFamily: Fonts.sansRegular, fontSize: 12, color: Colors.textDim }}>{subtitle}</Text>
        <View style={{ flex: 1 }} />
        {waveformActive && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 16, marginRight: 8 }}>
            {[bar1, bar2, bar3, bar4, bar5].map((b, i) => (
              <Animated.View
                key={i}
                style={{
                  width: 2,
                  height: 16,
                  backgroundColor: Colors.accent,
                  borderRadius: 1,
                  transform: [{ scaleY: b }],
                }}
              />
            ))}
          </View>
        )}
        <Pressable
          onPress={onVoiceToggle}
          style={{
            padding: 6,
            borderRadius: 6,
            backgroundColor: voiceEnabled ? 'rgba(185,28,28,0.1)' : 'transparent',
          }}
        >
          <Volume2 size={16} color={voiceEnabled ? Colors.accent : Colors.textDim} />
        </Pressable>
      </View>

      {visible.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: Colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: Colors.textPrimary, fontFamily: Fonts.serifRegular, fontSize: 24 }}>R</Text>
          </View>
          <Text
            style={{
              fontFamily: Fonts.serifItalic,
              fontSize: 26,
              color: Colors.textPrimary,
              marginTop: 22,
              textAlign: 'center',
              lineHeight: 32,
            }}
          >
            Your co-founder is ready.
          </Text>
          <Text style={{ fontFamily: Fonts.sansRegular, fontSize: 13, color: Colors.textDim, marginTop: 10 }}>
            Start talking.
          </Text>
        </View>
      ) : (
        <FlatList
          data={inverted}
          inverted
          keyExtractor={(_, i) => `m-${i}`}
          contentContainerStyle={{ paddingHorizontal: 22, paddingVertical: 18 }}
          renderItem={({ item }) => {
            if (item.role === 'assistant') {
              return (
                <View style={{ marginBottom: 18, maxWidth: '92%' }}>
                  <Text
                    style={{
                      fontFamily: Fonts.serifItalic,
                      fontSize: 19,
                      lineHeight: 32,
                      color: Colors.textPrimary,
                    }}
                  >
                    {item.content}
                  </Text>
                </View>
              );
            }
            return (
              <View style={{ marginBottom: 18, alignItems: 'flex-end' }}>
                <View
                  style={{
                    maxWidth: '78%',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    borderRadius: 18,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderWidth: 1,
                    borderColor: Colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: Fonts.sansRegular,
                      fontSize: 15,
                      lineHeight: 22,
                      color: '#C8D5E3',
                    }}
                  >
                    {item.content}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: 10,
          paddingBottom: Platform.OS === 'ios' ? 18 : 12,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          flexDirection: 'row',
          gap: 10,
        }}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          editable={!isStreaming}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textDim}
          multiline
          style={{
            flex: 1,
            color: Colors.textPrimary,
            fontFamily: Fonts.sansRegular,
            fontSize: 15,
            minHeight: 42,
            maxHeight: 120,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: 'rgba(122,144,168,0.25)',
            backgroundColor: 'transparent',
          }}
        />
        <Pressable
          onPress={handleSend}
          disabled={isStreaming || !input.trim()}
          style={{
            height: 42,
            paddingHorizontal: 16,
            borderRadius: 9,
            backgroundColor: Colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isStreaming || !input.trim() ? 0.5 : 1,
          }}
        >
          <Text style={{ color: Colors.textPrimary, fontFamily: Fonts.sansMedium, fontSize: 13, letterSpacing: 0.5 }}>
            Send
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
