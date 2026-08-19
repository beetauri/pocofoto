const UNSAFE_CAPTION_PATTERNS = [
  /\b(?:i['’]?ll|i will)\s+(?:kill|murder|hurt)\s+you\b/i,
  /\b(?:kill|murder|hurt)\s+(?:yourself|u)\b/i,
  /\b(?:rape|sexual assault)\b/i,
  /\b(?:nazi|terrorist)\b/i
];

export function isCaptionAllowed(value: string | null | undefined) {
  if (typeof value !== 'string') return false;
  return !UNSAFE_CAPTION_PATTERNS.some((pattern) => pattern.test(value));
}
