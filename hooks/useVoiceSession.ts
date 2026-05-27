import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { router } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import {
  useAudioRecorder,
  useAudioRecorderState,
  createAudioPlayer,
  setAudioModeAsync,
  AudioModule,
  RecordingPresets,
} from "expo-audio";
import type { AudioStatus } from "expo-audio";
import { reidFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import * as convo from "@/lib/conversationStore";
import { voiceReducer, type VoiceState, type VoiceEvent } from "@/lib/voice/machine";
import { meterToAmplitude } from "@/lib/voice/amplitude";
import { shouldAutoStop } from "@/lib/voice/silence";
import { voiceGateDecision } from "@/lib/voice/gating";
import { stripReidStream } from "@/lib/voice/strip";

const SILENCE_DB = -40;
const SILENCE_MS = 1500;
const SAMPLE_MS = 150;
const MAX_RECORD_MS = 30000;

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return typeof globalThis.btoa === "function" ? globalThis.btoa(bin) : "";
}

export function useVoiceSession() {
  const [state, dispatch] = useReducer(
    (s: VoiceState, e: VoiceEvent) => voiceReducer(s, e),
    "idle",
  );
  const [transcript, setTranscript] = useState("");
  const [reidResponse, setReidResponse] = useState("");
  const [micAmplitude, setMicAmplitude] = useState(0);
  const [playbackAmplitude, setPlaybackAmplitude] = useState(0);
  const [voiceBlocked, setVoiceBlocked] = useState(false);

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, SAMPLE_MS);

  const levelsRef = useRef<number[]>([]);
  const startedAtRef = useRef<number>(0);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const stateRef = useRef<VoiceState>("idle");
  stateRef.current = state;
  const busyRef = useRef(false);
  const pulseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subRef = useRef<{ remove: () => void } | null>(null);
  const hadExchangeRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshEntitlement = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: row } = await supabase
      .from("users").select("subscription_status").eq("auth_id", session.user.id).maybeSingle();
    const isPro = row?.subscription_status === "pro";
    const current = convo.getSnapshot().sessionId;
    let q = supabase.from("sessions").select("id", { count: "exact", head: true }).eq("voice_used", true);
    if (current) q = q.neq("id", current);
    const { count } = await q;
    setVoiceBlocked(!voiceGateDecision({ isPro, priorVoiceSessions: count ?? 0 }).allowed);
  }, []);

  useEffect(() => { void refreshEntitlement(); }, [refreshEntitlement]);

  const stopRecording = useCallback(async () => {
    if (stateRef.current !== "recording" || busyRef.current) return;
    busyRef.current = true;
    dispatch({ type: "SILENCE" });
    setMicAmplitude(0);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (!uri) throw new Error("no recording uri");
      await runTurn(uri);
    } catch {
      dispatch({ type: "ERROR" });
    } finally {
      busyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder]);

  // (a) CONFIRMED via context7: RecorderState.metering is number | undefined (optional).
  // Field name "metering" is correct. Fallback to simulated amplitude when absent.
  useEffect(() => {
    if (state !== "recording") return;
    const db = recorderState.metering;
    if (typeof db === "number") {
      setMicAmplitude(meterToAmplitude(db));
      levelsRef.current = [...levelsRef.current.slice(-40), db];
      if (shouldAutoStop(levelsRef.current, SILENCE_DB, SILENCE_MS, SAMPLE_MS)) void stopRecording();
    } else {
      setMicAmplitude(0.4 + 0.4 * Math.abs(Math.sin(Date.now() / 250)));
    }
    if (Date.now() - startedAtRef.current > MAX_RECORD_MS) void stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState, state]);

  const startSession = useCallback(async () => {
    if (stateRef.current !== "idle" || busyRef.current) return;
    if (voiceBlocked) { router.push("/upgrade"); return; }
    busyRef.current = true;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { setTranscript("Microphone permission denied."); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      levelsRef.current = [];
      startedAtRef.current = Date.now();
      setTranscript("");
      setReidResponse("");
      await recorder.prepareToRecordAsync();
      recorder.record();
      dispatch({ type: "TAP" });
    } finally {
      busyRef.current = false;
    }
  }, [recorder, voiceBlocked]);

  async function runTurn(uri: string) {
    const form = new FormData();
    form.append("file", { uri, name: "speech.m4a", type: "audio/m4a" } as unknown as Blob);
    const tRes = await reidFetch("/api/transcribe", { method: "POST", body: form });
    if (!tRes.ok) {
      dispatch({ type: "ERROR" });
      setTranscript(tRes.status === 429 ? "Slow down — try again in a moment." : "Could not hear that.");
      return;
    }
    const { transcript: text } = (await tRes.json()) as { transcript: string };
    if (!text.trim()) { dispatch({ type: "RESET" }); return; }
    setTranscript(text);
    convo.append({ role: "user", content: text });

    const rRes = await reidFetch("/api/reid", {
      method: "POST",
      body: JSON.stringify({ mode: "chat", voice: true, sessionId: convo.getSnapshot().sessionId, messages: convo.getSnapshot().messages }),
    });
    if (!rRes.ok) { dispatch({ type: "ERROR" }); convo.dropLast(); return; }
    const sid = rRes.headers.get("X-Reid-Session-Id") ?? rRes.headers.get("x-reid-session-id");
    if (sid) convo.setSessionId(sid);
    let acc = "";
    const body = rRes.body as ReadableStream<Uint8Array> | null | undefined;
    if (body && typeof body.getReader === "function") {
      const reader = body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) { acc += dec.decode(value, { stream: true }); setReidResponse(stripReidStream(acc)); }
      }
    } else {
      acc = await rRes.text();
      setReidResponse(stripReidStream(acc));
    }
    const reply = stripReidStream(acc).trim();
    convo.append({ role: "assistant", content: reply });
    hadExchangeRef.current = true;

    dispatch({ type: "REPLY_READY" });
    await playReply(reply);
  }

  async function playReply(text: string) {
    try {
      const res = await reidFetch("/api/tts", { method: "POST", body: JSON.stringify({ text }) });
      if (!res.ok) { dispatch({ type: "PLAYBACK_DONE" }); return; }
      const buf = await res.arrayBuffer();
      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!dir) { dispatch({ type: "PLAYBACK_DONE" }); return; }
      const fileUri = `${dir}reid_voice_turn.mp3`;
      await FileSystem.writeAsStringAsync(fileUri, bytesToBase64(new Uint8Array(buf)), { encoding: FileSystem.EncodingType.Base64 });

      playerRef.current?.remove();
      if (pulseRef.current) { clearInterval(pulseRef.current); pulseRef.current = null; }
      subRef.current?.remove();
      subRef.current = null;
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }

      const player = createAudioPlayer({ uri: fileUri });
      playerRef.current = player;

      const finishPlayback = () => {
        if (pulseRef.current) { clearInterval(pulseRef.current); pulseRef.current = null; }
        if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
        setPlaybackAmplitude(0);
        subRef.current?.remove();
        subRef.current = null;
        if (playerRef.current === player) { player.remove(); playerRef.current = null; }
        dispatch({ type: "PLAYBACK_DONE" });
      };

      // (b) CONFIRMED via context7: AudioEvents has "playbackStatusUpdate" with AudioStatus payload.
      // AudioStatus.didJustFinish: boolean — field name confirmed correct.
      pulseRef.current = setInterval(() => setPlaybackAmplitude(0.3 + 0.5 * Math.random()), 120);
      const sub = player.addListener("playbackStatusUpdate", (s: AudioStatus) => {
        if (s.didJustFinish) finishPlayback();
      });
      subRef.current = sub;
      // Watchdog: if playback never reports completion (interruption, decode
      // error, audio-route change), don't strand the FSM in "playing".
      watchdogRef.current = setTimeout(finishPlayback, 60000);
      player.play();
    } catch {
      dispatch({ type: "PLAYBACK_DONE" });
    }
  }

  useEffect(() => () => {
    playerRef.current?.remove();
    if (pulseRef.current) clearInterval(pulseRef.current);
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    subRef.current?.remove();
  }, []);

  return {
    sessionState: state,
    transcript,
    reidResponse,
    micAmplitude,
    playbackAmplitude,
    voiceBlocked,
    startSession,
    stopRecording,
    refreshEntitlement,
    hadExchangeRef,
  };
}
