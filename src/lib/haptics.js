const hapticPatterns = {
  tap: 35,
  success: [35, 60, 35]
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
