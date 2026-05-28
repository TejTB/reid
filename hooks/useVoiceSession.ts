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
import { stripReidStream, splitOnboardingComplete } from "@/lib/voice/strip";
import { speechEnvelope } from "@/lib/voice/envelope";

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

export type VoiceSessionOptions = {
  /** Conversation mode sent to /api/reid. Default "chat". */
  mode?: "chat" | "onboarding";
  /** Whether to enforce the voice entitlement gate. Default true. Onboarding
   *  passes false (first contact is always free). */
  gate?: boolean;
  /** Fired after playback finishes for the turn that completed onboarding
   *  (server `[ONBOARDING_COMPLETE]` sentinel or DB flag). */
  onComplete?: () => void;
};

export function useVoiceSession(opts: VoiceSessionOptions = {}) {
  const mode = opts.mode ?? "chat";
  const gate = opts.gate ?? true;

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
  const completeRef = useRef(false);
  const onCompleteRef = useRef(opts.onComplete);
  onCompleteRef.current = opts.onComplete;

  const refreshEntitlement = useCallback(async () => {
    if (!gate) { setVoiceBlocked(false); return; }
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
  }, [gate]);

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

  // Shared: POST the current conversation to /api/reid, stream the reply,
  // strip control markers + the onboarding sentinel. Used by both the
  // record-first turn (runTurn) and the speak-first opening (kickoff).
  async function streamReid(): Promise<{ reply: string; complete: boolean } | null> {
    const rRes = await reidFetch("/api/reid", {
      method: "POST",
      body: JSON.stringify({ mode, voice: true, sessionId: convo.getSnapshot().sessionId, messages: convo.getSnapshot().messages }),
    });
    if (!rRes.ok) return null;
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
        if (value) { acc += dec.decode(value, { stream: true }); setReidResponse(splitOnboardingComplete(stripReidStream(acc)).body); }
      }
    } else {
      acc = await rRes.text();
      setReidResponse(splitOnboardingComplete(stripReidStream(acc)).body);
    }
    const split = splitOnboardingComplete(stripReidStream(acc));
    let complete = split.complete;
    // Fallback: onboarding may set the DB flag without emitting the sentinel.
    if (mode === "onboarding" && !complete) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: u } = await supabase
            .from("users").select("onboarding_complete").eq("auth_id", session.user.id).maybeSingle();
          if (u?.onboarding_complete) complete = true;
        }
      } catch {}
    }
    return { reply: split.body.trim(), complete };
  }

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

    const out = await streamReid();
    if (!out) { dispatch({ type: "ERROR" }); convo.dropLast(); return; }
    convo.append({ role: "assistant", content: out.reply });
    hadExchangeRef.current = true;
    if (out.complete) completeRef.current = true;

    dispatch({ type: "REPLY_READY" });
    await playReply(out.reply);
  }

  // Speak-first opening: Reid talks before the user records (onboarding /
  // first contact). idle → processing (OPENING) → playing.
  const kickoff = useCallback(async () => {
    if (stateRef.current !== "idle" || busyRef.current) return;
    busyRef.current = true;
    try {
      dispatch({ type: "OPENING" });
      // Speak-first never records, so set the playback audio mode here
      // (startSession does this for the record-first path).
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const out = await streamReid();
      if (!out) { dispatch({ type: "ERROR" }); return; }
      convo.append({ role: "assistant", content: out.reply });
      hadExchangeRef.current = true;
      if (out.complete) completeRef.current = true;
      dispatch({ type: "REPLY_READY" });
      await playReply(out.reply);
    } finally {
      busyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // Fire the onboarding-complete callback only after Reid finishes
        // speaking the completing turn, so navigation never clips the audio.
        if (completeRef.current) { completeRef.current = false; onCompleteRef.current?.(); }
      };

      // (b) CONFIRMED via context7: AudioEvents has "playbackStatusUpdate" with AudioStatus payload.
      // AudioStatus.didJustFinish: boolean — field name confirmed correct.
      // Shaped speech-envelope (not random) drives the SPEAKING orb amplitude.
      const playStart = Date.now();
      pulseRef.current = setInterval(() => setPlaybackAmplitude(speechEnvelope(Date.now() - playStart)), 80);
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
    kickoff,
    refreshEntitlement,
    hadExchangeRef,
  };
}
