const hapticPatterns = {
  tap: 10,
  success: [12, 40, 18]
};

function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function triggerHaptic(kind = 'tap') {
  const pattern = hapticPatterns[kind];
  if (!pattern || !canVibrate()) return false;

  try {
    return navigator.vibrate(pattern) === true;
  } catch {
    return false;
  }
}
