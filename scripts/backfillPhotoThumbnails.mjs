#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';

const DEFAULT_PROJECT_ID = 'sixth-bonbon-402909';
const THUMBNAIL_SIZE = 256;
const THUMBNAIL_CONTENT_TYPE = 'image/webp';
const THUMBNAIL_FORMAT = 'webp';

function printHelp() {
  console.log(`
Backfill 256px WebP History thumbnails for existing Pocofoto photos.

Usage:
  npm run backfill:thumbnails -- [options]

Options:
  --write             Persist Storage uploads and Firestore updates. Default is dry-run.
  --dry-run           Preview work without writing updates.
  --force             Recompute photos that already have thumbnailUrl.
  --limit N           Scan at most N photo documents.
  --project-id ID     Firebase project id. Defaults to ${DEFAULT_PROJECT_ID}.
  --bucket NAME       Firebase Storage bucket. Defaults to the app default bucket.
  --help              Show this help.

Environment:
  FIREBASE_PROJECT_ID, GCLOUD_PROJECT, or GOOGLE_CLOUD_PROJECT may override the default project.
  FIREBASE_STORAGE_BUCKET may override the default bucket.
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
      || DEFAULT_PROJECT_ID,
    bucket: process.env.FIREBASE_STORAGE_BUCKET || null
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
      if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit requires a positive integer.');
      options.limit = limit;
    } else if (arg.startsWith('--limit=')) {
      const limit = Number.parseInt(arg.slice('--limit='.length), 10);
      if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit requires a positive integer.');
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
    } else if (arg === '--bucket') {
      const bucket = argv[i + 1];
      i += 1;
      if (!bucket) throw new Error('--bucket requires a value.');
      options.bucket = bucket;
    } else if (arg.startsWith('--bucket=')) {
      const bucket = arg.slice('--bucket='.length);
      if (!bucket) throw new Error('--bucket requires a value.');
      options.bucket = bucket;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function isCouplePhotoDoc(docRef) {
  return /^couples\/[^/]+\/photos\/[^/]+$/.test(docRef.path);
}

function coupleIdFromPhotoDoc(docRef) {
  return docRef.path.split('/')[1];
}

async function createThumbnailBuffer(photoUrl) {
  const response = await fetch(photoUrl);
  if (!response.ok) throw new Error(`Photo fetch failed with HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Photo fetch returned non-image content-type: ${contentType}`);
  }

  const input = Buffer.from(await response.arrayBuffer());
  return sharp(input)
    .rotate()
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover', position: 'centre' })
    .webp({ quality: 76 })
    .toBuffer();
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
      projectId: options.projectId,
      storageBucket: options.bucket || `${options.projectId}.firebasestorage.app`
    });
  }

  const db = getFirestore();
  const bucket = getStorage().bucket(options.bucket || undefined);
  let query = db.collectionGroup('photos');
  if (options.limit) query = query.limit(options.limit);

  console.log(`Starting thumbnail backfill for project ${options.projectId}.`);
  console.log(`Bucket: ${bucket.name}.`);
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'write'}${options.force ? ', force' : ''}${options.limit ? `, limit ${options.limit}` : ''}.`);

  const snapshot = await query.get();
  const summary = {
    scanned: 0,
    skippedPath: 0,
    skippedExisting: 0,
    skippedMissingUrl: 0,
    prepared: 0,
    uploaded: 0,
    updated: 0,
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
    if (data.thumbnailUrl && !options.force) {
      summary.skippedExisting += 1;
      console.log(`skip existing ${doc.ref.path}`);
      continue;
    }

    if (!data.photoUrl || typeof data.photoUrl !== 'string') {
      summary.skippedMissingUrl += 1;
      console.log(`skip missing-photoUrl ${doc.ref.path}`);
      continue;
    }

    try {
      const coupleId = coupleIdFromPhotoDoc(doc.ref);
      const objectPath = `couples/${coupleId}/thumbnails/${doc.id}.${THUMBNAIL_FORMAT}`;
      summary.prepared += 1;
      console.log(`${options.dryRun ? 'prepare' : 'write'} ${doc.ref.path} -> ${objectPath}`);

      if (!options.dryRun) {
        const thumbnailBuffer = await createThumbnailBuffer(data.photoUrl);
        const file = bucket.file(objectPath);
        const downloadToken = randomUUID();
        await file.save(thumbnailBuffer, {
          resumable: false,
          metadata: {
            contentType: THUMBNAIL_CONTENT_TYPE,
            cacheControl: 'public, max-age=31536000',
            metadata: {
              firebaseStorageDownloadTokens: downloadToken
            }
          }
        });
        summary.uploaded += 1;

        const thumbnailUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
        await doc.ref.update({
          thumbnailUrl,
          thumbnailSize: THUMBNAIL_SIZE,
          thumbnailFormat: THUMBNAIL_FORMAT
        });
        summary.updated += 1;
      }
    } catch (err) {
      summary.failed += 1;
      console.error(`fail ${doc.ref.path}: ${err.message}`);
    }
  }

  console.log('Thumbnail backfill summary:', summary);
  if (options.dryRun) {
    console.log('Dry-run only. Re-run with --write to upload thumbnails and update photo docs.');
  }
}

main().catch((err) => {
  console.error(`Thumbnail backfill aborted: ${err.message}`);
  process.exitCode = 1;
});
