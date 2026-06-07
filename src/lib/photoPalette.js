const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const SAMPLE_SIZE = 28;
const MAX_COLORS = 3;

function componentToHex(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

function rgbToHex(r, g, b) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

export function normalizePalette(palette) {
  if (!palette || !Array.isArray(palette.colors)) return null;

  const colors = palette.colors
    .filter((color) => typeof color === 'string' && HEX_COLOR_PATTERN.test(color))
    .slice(0, MAX_COLORS)
    .map((color) => color.toUpperCase());

  if (colors.length === 0 || colors.length !== Math.min(palette.colors.length, MAX_COLORS)) {
    return null;
  }

  return { colors };
}

export function buildPaletteFromImageData(imageData) {
  if (!imageData?.data || imageData.data.length < 4) return null;

  const buckets = new Map();
  for (let i = 0; i < imageData.data.length; i += 4) {
    const alpha = imageData.data[i + 3];
    if (alpha < 64) continue;

    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    const hex = rgbToHex(r, g, b);
    buckets.set(hex, (buckets.get(hex) || 0) + 1);
  }

  const colors = Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_COLORS)
    .map(([hex]) => hex);

  return normalizePalette({ colors });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image for palette extraction'));
    image.src = source;
  });
}

export async function extractPaletteFromImageSource(source) {
  if (!source || typeof document === 'undefined' || typeof Image === 'undefined') return null;

  try {
    const image = await loadImage(source);
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return buildPaletteFromImageData(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE));
  } catch (err) {
    console.debug('Photo palette extraction skipped.', err);
    return null;
  }
}

export async function extractPaletteFromBlob(blob) {
  if (!blob || typeof URL === 'undefined') return null;

  const objectUrl = URL.createObjectURL(blob);
  try {
    return await extractPaletteFromImageSource(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
