export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
export const HERO_ID_PATTERN = /^[a-z0-9-]+$/;
const SYNTHETIC_EMAIL_DOMAIN = 'accounts.vibefighter.app';

export function validateUsername(
  raw: string
): { ok: true; username: string; usernameLower: string } | { ok: false; message: string } {
  const username = raw.trim();
  if (username.length < 3 || username.length > 20) {
    return { ok: false, message: 'Username must be 3–20 characters long.' };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, message: 'Username can only use letters, numbers, and _.' };
  }
  return { ok: true, username, usernameLower: username.toLowerCase() };
}

export function validatePassword(
  raw: string
): { ok: true; password: string } | { ok: false; message: string } {
  if (raw.length < 6) {
    return { ok: false, message: 'Password must be at least 6 characters.' };
  }
  if (raw.length > 128) {
    return { ok: false, message: 'Password must be 128 characters or fewer.' };
  }
  return { ok: true, password: raw };
}

export function usernameToSyntheticEmail(usernameLower: string): string {
  return `${usernameLower}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export function sanitizeHeroId(heroId: string): string {
  const cleaned = heroId.trim().toLowerCase().slice(0, 64);
  return HERO_ID_PATTERN.test(cleaned) ? cleaned : 'sukuna';
}
