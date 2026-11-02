/** Signup and password changes share the same complexity requirements. */
export function isStrongPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) &&
    /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}
