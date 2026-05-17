export function reidErrorFor(message: string): string {
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
  if (m.includes('token has expired') || m.includes('expired')) {
    return 'That code expired. Resend a new one.';
  }
  if (m.includes('invalid token') || m.includes('otp_invalid')) {
    return 'Wrong code.';
  }
  return "Couldn't send the code. Try again.";
}
