import { hasServerSession as checkServerSession } from "@/core/auth/bootstrap.actions";

export function setAccessTokenCookie(session) {
  if (!session?.access_token) return;
  const maxAge = Number.isFinite(session.expires_in) ? session.expires_in : 3600;
  document.cookie = `sb-access-token=${encodeURIComponent(session.access_token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export async function waitForServerSession(maxAttempts = 4) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await checkServerSession()) return true;
    await new Promise((resolve) => { window.setTimeout(resolve, 120); });
  }
  return false;
}

export function validateFields(nextInput, nextPassword) {
  const errors = { email: "", password: "" };
  const normalizedInput = String(nextInput || "").trim();
  const normalizedPassword = String(nextPassword || "").trim();
  if (!normalizedInput) {
    errors.email = "Email or username is required.";
  } else if (normalizedInput.includes("@")) {
    // Email validation (must have @ with something before and after)
    const emailParts = normalizedInput.split("@");
    if (emailParts.length !== 2 || !emailParts[0] || !emailParts[1]) {
      errors.email = "Please enter a valid email address.";
    }
  }
  // If no @, it's treated as a username — no additional validation beyond "not empty"
  if (!normalizedPassword) errors.password = "Password is required.";
  return errors;
}

export function mapLoginError(errorMessage) {
  const text = String(errorMessage || "").toLowerCase();
  if (text.includes("invalid") || text.includes("credentials")) return "Email or password is incorrect.";
  if (text.includes("email not confirmed")) return "Email is not confirmed. Check your inbox for the confirmation link.";
  if (text.includes("username not found")) return "Username not found.";
  if (String(errorMessage || "").trim()) return String(errorMessage);
  return "Unable to sign in right now. Please try again.";
}
