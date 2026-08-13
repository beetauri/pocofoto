export const MIN_DISPLAY_NAME_LENGTH = 2;
export const MAX_DISPLAY_NAME_LENGTH = 30;

export function normalizeDisplayName(value: string) {
  return value.trim();
}

export function displayNameError(value: string): 'length' | null {
  const normalized = normalizeDisplayName(value);
  return normalized.length < MIN_DISPLAY_NAME_LENGTH || normalized.length > MAX_DISPLAY_NAME_LENGTH
    ? 'length'
    : null;
}
