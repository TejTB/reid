/** Voice entitlement. Pro = unlimited. Non-pro get exactly one free voice
 *  session: `priorVoiceSessions` counts COMPLETED voice sessions excluding the
 *  in-progress one (the caller excludes the active sessionId), so a free user
 *  can finish a full multi-turn session before the gate trips next time. */
export function voiceGateDecision(args: {
  isPro: boolean;
  priorVoiceSessions: number;
}): { allowed: boolean } {
  return { allowed: args.isPro || args.priorVoiceSessions < 1 };
}
