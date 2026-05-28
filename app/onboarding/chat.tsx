import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { reidFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import LogoMark from '@/components/LogoMark';
import ReidPulse from '@/components/ReidPulse';

type Msg = { role: 'user' | 'assistant'; content: string };

const ONBOARDING_SENTINEL = '[ONBOARDING_COMPLETE]';

function stripSentinel(text: string): { body: string; hasSentinel: boolean } {
  const idx = text.indexOf(ONBOARDING_SENTINEL);
  if (idx === -1) return { body: text, hasSentinel: false };
  return { body: text.slice(0, idx).trim(), hasSentinel: true };
}

export default function OnboardingChat() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState('');
  const [completing, setCompleting] = useState(false);
  const streamStarted = useRef(false);
  const completionTriggered = useRef(false);

  async function runStream(seed: Msg[]) {
    setIsStreaming(true);
    setStreamingText('');
    let acc = '';
    try {
      const res = await reidFetch('/api/reid', {
        method: 'POST',
        body: JSON.stringify({ mode: 'onboarding', messages: seed }),
      });
      if (!res.ok) {
        let bodyText = '';
        try { bodyText = (await res.text()).slice(0, 200); } catch {}
        throw new Error(`HTTP ${res.status}${bodyText ? ` — ${bodyText}` : ''}`);
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

    const close = stripSentinel(acc);
    const cleaned = close.hasSentinel ? close.body : acc;
    setMessages((prev) => [...prev, { role: 'assistant', content: cleaned }]);
    setStreamingText('');
    setIsStreaming(false);

    if (close.hasSentinel) {
      void triggerCompletion();
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: u } = await supabase
          .from('users')
          .select('onboarding_complete')
          .eq('auth_id', session.user.id)
          .maybeSingle();
        if (u?.onboarding_complete) void triggerCompletion();
      }
    } catch {
    }
  }

  function triggerCompletion() {
    if (completionTriggered.current) return;
    completionTriggered.current = true;
    setCompleting(true);
    setTimeout(() => router.replace('/(app)/reid'), 1800);
  }

  useEffect(() => {
    if (streamStarted.current) return;
    streamStarted.current = true;
    void runStream([]);
  }, []);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || completing) return;
    const next: Msg[] = [...messages, { role: 'user', content: trimmed }];
    setInput('');
    setMessages(next);
    await runStream(next);
  }

  const visible: Msg[] = [...messages];
  if (streamingText && isStreaming) {
    const { body } = stripSentinel(streamingText);
    visible.push({ role: 'assistant', content: body });
  }
  const inverted = [...visible].reverse();

  if (completing) {
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
            fontFamily: Fonts.serifItalic,
            color: Colors.textPrimary,
            fontSize: 22,
            textAlign: 'center',
            lineHeight: 30,
            maxWidth: 320,
          }}
        >
          We{"’"}re ready.
        </Text>
        <View style={{ marginTop: 18 }}>
          <ReidPulse size={40} />
        </View>
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
          paddingTop: insets.top + 12,
          paddingHorizontal: 24,
          paddingBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        }}
      >
        <LogoMark size={28} />
        <Text style={{ fontFamily: Fonts.serifRegular, color: Colors.textPrimary, fontSize: 19, letterSpacing: -0.38 }}>
          Reid
        </Text>
      </View>

      <FlatList
        data={inverted}
        inverted
        keyExtractor={(_, i) => `m-${i}`}
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 20 }}
        renderItem={({ item }) => {
          if (item.role === 'assistant') {
            return (
              <View style={{ marginBottom: 20, maxWidth: '92%' }}>
                <Text
                  style={{
                    fontFamily: Fonts.serifItalic,
                    fontSize: 19,
                    lineHeight: 30,
                    color: Colors.textPrimary,
                  }}
                >
                  {item.content}
                </Text>
              </View>
            );
          }
          return (
            <View style={{ marginBottom: 20, alignItems: 'flex-end' }}>
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

      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: 10,
          paddingBottom: 12 + insets.bottom,
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
          placeholder="Say something."
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
