import { isCaptionAllowed } from './captionSafety';

export const MAX_CAPTION_LENGTH = 36;

export function clampCaptionText(value: string | null | undefined): string {
  return (value || '').replace(/\r?\n/g, ' ').slice(0, MAX_CAPTION_LENGTH);
}

export function buildCaptionPayload(value: string | null | undefined): { type: 'text'; text: string } | null {
  const text = clampCaptionText(value).trim();
  return text && isCaptionAllowed(text) ? { type: 'text', text } : null;
}
