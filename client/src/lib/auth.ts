export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*/.test(error.message);
}

export function handleGoogleAuth() {
  window.location.href = "/auth/google";
}
