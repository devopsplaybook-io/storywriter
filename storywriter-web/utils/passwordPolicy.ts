// Keep in sync with the server's PASSWORD_MIN_LENGTH (storywriter-server).
export const PASSWORD_MIN_LENGTH = 8;

/** Mirrors the server rule: passwords are counted in code points. */
export function PasswordTooShort(password: string): boolean {
  return [...String(password || "")].length < PASSWORD_MIN_LENGTH;
}

export function PasswordMinimumHint(): string {
  return `At least ${PASSWORD_MIN_LENGTH} characters`;
}
