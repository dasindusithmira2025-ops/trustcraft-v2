export const INTENTS = ["consumer", "professional", "business", "facility"] as const;
export type Intent = (typeof INTENTS)[number];

const COMMON = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwertyuiop", "trustcraft", "iloveyou12", "letmein123"]);

/** Length over composition rules; refuses the handful of passwords everyone tries first. */
export const passwordProblem = (pw: string, email = ""): string | null => {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 200) return "That password is too long.";
  if (COMMON.has(pw.toLowerCase()) || pw.toLowerCase() === email.toLowerCase()) return "Choose something harder to guess.";
  return null;
};
