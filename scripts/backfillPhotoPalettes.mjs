#!/usr/bin/env node

import process from 'node:process';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import sharp from 'sharp';

const DEFAULT_PROJECT_ID = 'sixth-bonbon-402909';
const SAMPLE_SIZE = 32;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

function printHelp() {
  console.log(`
Backfill paletteV2 metadata for existing Pocofoto photos.

Usage:
  npm run backfill:palettes -- [options]

Options:
  --write             Persist paletteV2 updates. Default is dry-run.
  --dry-run           Preview work without writing updates.
  --force             Recompute photos that already have valid paletteV2.
  --limit N           Scan at most N photo documents.
  --project-id ID     Firebase project id. Defaults to ${DEFAULT_PROJECT_ID}.
  --help              Show this help.

Environment:
  FIREBASE_PROJECT_ID, GCLOUD_PROJECT, or GOOGLE_CLOUD_PROJECT may override the default project.
  Uses Firebase Admin application default credentials.
`);
}

function parseArgs(argv) {
  const options = {
    dryRun: true,
    force: false,
    help: false,
    limit: null,
    projectId:
      process.env.FIREBASE_PROJECT_ID
      || process.env.GCLOUD_PROJECT
      || process.env.GOOGLE_CLOUD_PROJECT
      || DEFAULT_PROJECT_ID
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--write') {
      options.dryRun = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--limit') {
      const rawLimit = argv[i + 1];
      i += 1;
      const limit = Number.parseInt(rawLimit, 10);
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error('--limit requires a positive integer.');
      }
      options.limit = limit;
    } else if (arg.startsWith('--limit=')) {
      const limit = Number.parseInt(arg.slice('--limit='.length), 10);
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error('--limit requires a positive integer.');
      }
      options.limit = limit;
    } else if (arg === '--project-id') {
      const projectId = argv[i + 1];
      i += 1;
      if (!projectId) throw new Error('--project-id requires a value.');
      options.projectId = projectId;
    } else if (arg.startsWith('--project-id=')) {
      const projectId = arg.slice('--project-id='.length);
      if (!projectId) throw new Error('--project-id requires a value.');
      options.projectId = projectId;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function componentToHex(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

function rgbToHex(r, g, b) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function quantize(value) {
  return Math.max(0, Math.min(255, Math.round(value / 16) * 16));
}

function normalizePaletteV2(palette) {
  if (!palette || palette.version !== 2) return null;
  if (!HEX_COLOR_PATTERN.test(palette.topColor || '')) return null;
  if (!HEX_COLOR_PATTERN.test(palette.bottomColor || '')) return null;

  const topColor = palette.topColor;
  const bottomColor = palette.bottomColor;
  const colors = Array.isArray(palette.colors)
    ? palette.colors
    : [];

  if (colors.length !== 2 || colors[0] !== topColor || colors[1] !== bottomColor) return null;
  return { version: 2, topColor, bottomColor, colors };
}

function dominantColorForRange(data, startRow, endRow, width) {
  const buckets = new Map();

  for (let row = startRow; row < endRow; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const i = (row * width + col) * 4;
      const alpha = data[i + 3];
      if (alpha < 64) continue;

      const hex = rgbToHex(quantize(data[i]), quantize(data[i + 1]), quantize(data[i + 2]));
      buckets.set(hex, (buckets.get(hex) || 0) + 1);
    }
  }

  return Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex)[0] || null;
}

function buildPaletteV2FromRawPixels({ data, info }) {
  if (!data || !info?.width || !info?.height) return null;

  const split = Math.max(1, Math.floor(info.height / 2));
  const topColor = dominantColorForRange(data, 0, split, info.width);
  const bottomColor = dominantColorForRange(data, split, info.height, info.width);
  if (!topColor || !bottomColor) return null;

  return normalizePaletteV2({
    version: 2,
    topColor,
    bottomColor,
    colors: [topColor, bottomColor]
  });
}

async function extractPaletteV2FromUrl(photoUrl) {
  const response = await fetch(photoUrl);
  if (!response.ok) {
    throw new Error(`Photo fetch failed with HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Photo fetch returned non-image content-type: ${contentType}`);
  }

  const input = Buffer.from(await response.arrayBuffer());
  const output = await sharp(input)
    .rotate()
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return buildPaletteV2FromRawPixels(output);
}

function isCouplePhotoDoc(docRef) {
  return /^couples\/[^/]+\/photos\/[^/]+$/.test(docRef.path);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: options.projectId
    });
  }

  const db = getFirestore();
  let query = db.collectionGroup('photos');
  if (options.limit) query = query.limit(options.limit);

  console.log(`Starting paletteV2 backfill for project ${options.projectId}.`);
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'write'}${options.force ? ', force' : ''}${options.limit ? `, limit ${options.limit}` : ''}.`);

  const snapshot = await query.get();
  const summary = {
    scanned: 0,
    skippedValid: 0,
    skippedPath: 0,
    skippedMissingUrl: 0,
    prepared: 0,
    written: 0,
    failed: 0
  };

  for (const doc of snapshot.docs) {
    summary.scanned += 1;

    if (!isCouplePhotoDoc(doc.ref)) {
      summary.skippedPath += 1;
      console.log(`skip path ${doc.ref.path}`);
      continue;
    }

    const data = doc.data();
    const existingPaletteV2 = normalizePaletteV2(data.paletteV2);
    if (existingPaletteV2 && !options.force) {
      summary.skippedValid += 1;
      console.log(`skip valid ${doc.ref.path} ${existingPaletteV2.topColor}/${existingPaletteV2.bottomColor}`);
      continue;
    }

    if (!data.photoUrl || typeof data.photoUrl !== 'string') {
      summary.skippedMissingUrl += 1;
      console.log(`skip missing-photoUrl ${doc.ref.path}`);
      continue;
    }

    try {
      const paletteV2 = await extractPaletteV2FromUrl(data.photoUrl);
      if (!paletteV2) {
        throw new Error('Unable to extract a valid paletteV2.');
      }

      summary.prepared += 1;
      console.log(`${options.dryRun ? 'prepare' : 'write'} ${doc.ref.path} ${paletteV2.topColor}/${paletteV2.bottomColor}`);

      if (!options.dryRun) {
        await doc.ref.update({ paletteV2 });
        summary.written += 1;
      }
    } catch (err) {
      summary.failed += 1;
      console.error(`fail ${doc.ref.path}: ${err.message}`);
    }
  }

  console.log('PaletteV2 backfill summary:', summary);
  if (options.dryRun) {
    console.log('Dry-run only. Re-run with --write to persist paletteV2 updates.');
  }
}

main().catch((err) => {
  console.error(`PaletteV2 backfill aborted: ${err.message}`);
  process.exitCode = 1;
});
