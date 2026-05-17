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
  if (m.includes('invalid login credentials')) {
    return 'Email or password is wrong.';
  }
  if (m.includes('user already registered') || m.includes('already registered')) {
    return 'That email already has an account. Sign in instead.';
  }
  if (m.includes('password should be') || m.includes('weak password')) {
    return 'Password needs at least 6 characters.';
  }
  if (m.includes('invalid email') || m.includes('invalid_email')) {
    return "That email doesn't look right.";
  }
  if (m.includes('email not confirmed')) {
    return 'Check your inbox to confirm your account first.';
  }
  return "Couldn't sign in. Try again.";
}
