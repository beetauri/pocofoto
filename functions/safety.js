export const REPORT_REASONS = Object.freeze([
  'abuse',
  'harassment',
  'sexual-content',
  'threats',
  'other'
]);

const UNSAFE_CAPTION_PATTERNS = [
  /\b(?:i['’]?ll|i will)\s+(?:kill|murder|hurt)\s+you\b/i,
  /\b(?:kill|murder|hurt)\s+(?:yourself|u)\b/i,
  /\b(?:rape|sexual assault)\b/i,
  /\b(?:nazi|terrorist)\b/i
];

export function isCaptionAllowed(value) {
  if (typeof value !== 'string') return false;
  return !UNSAFE_CAPTION_PATTERNS.some((pattern) => pattern.test(value));
}

export function validateReportInput(input = {}) {
  const photoId = typeof input.photoId === 'string' ? input.photoId.trim() : '';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!photoId) throw new Error('A photo ID is required.');
  if (!REPORT_REASONS.includes(reason)) throw new Error('A supported report reason is required.');
  return { photoId, reason };
}
