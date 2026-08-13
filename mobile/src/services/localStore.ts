import * as FileSystem from 'expo-file-system/legacy';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { LocalPhoto } from '../domain/localQueue';

type QueueRow = {
  id: string;
  user_id: string;
  couple_id: string;
  uri: string;
  thumbnail_uri: string | null;
  caption_json: string | null;
  sent_at: string;
  status: LocalPhoto['localStatus'];
  error_message: string;
};

type DraftRow = { draft_key: string; uri: string; thumbnail_uri: string | null; caption_text: string };

let databasePromise: Promise<SQLiteDatabase> | null = null;
const draftOperations = new Map<string, Promise<unknown>>();

function queueDraftOperation<T>(key: string, operation: () => Promise<T>) {
  const previous = draftOperations.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  const tracked = next.then(() => undefined, () => undefined);
  draftOperations.set(key, tracked);
  return next.finally(() => {
    if (draftOperations.get(key) === tracked) draftOperations.delete(key);
  });
}

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync('pocofoto-local.db').then(async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS photo_queue (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          couple_id TEXT NOT NULL,
          uri TEXT NOT NULL,
          thumbnail_uri TEXT,
          caption_json TEXT,
          sent_at TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS review_drafts (
          draft_key TEXT PRIMARY KEY NOT NULL,
          uri TEXT NOT NULL,
          thumbnail_uri TEXT,
          caption_text TEXT NOT NULL
        );
      `);
      await db.execAsync('ALTER TABLE review_drafts ADD COLUMN thumbnail_uri TEXT;').catch(() => undefined);
      return db;
    });
  }
  return databasePromise;
}

function rowToPhoto(row: QueueRow): LocalPhoto {
  let caption: LocalPhoto['caption'] = null;
  if (row.caption_json) {
    try {
      caption = JSON.parse(row.caption_json) as LocalPhoto['caption'];
    } catch {
      caption = null;
    }
  }
  return {
    id: row.id,
    localOnly: true,
    localStatus: row.status === 'failed' ? 'failed' : 'pending',
    localError: row.error_message,
    photoUrl: row.uri,
    thumbnailUrl: row.thumbnail_uri,
    caption,
    timestamp: row.sent_at,
    liked: false,
    coupleId: row.couple_id,
    senderId: row.user_id
  };
}

export async function copyFileToDurableStorage(uri: string, id: string, extension = 'jpg'): Promise<string> {
  if (!FileSystem.documentDirectory) throw new Error('Native document storage is unavailable.');
  const directory = `${FileSystem.documentDirectory}pocofoto-photos/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${id}.${extension}`;
  await FileSystem.deleteAsync(destination, { idempotent: true });
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}

export const copyPhotoToDurableStorage = (uri: string, id: string) => copyFileToDurableStorage(uri, id, 'jpg');

export async function deleteLocalPhotoFile(uri: string | null | undefined) {
  if (!uri?.startsWith('file://')) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function loadPhotoQueue(userId: string, coupleId: string): Promise<LocalPhoto[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<QueueRow>('SELECT * FROM photo_queue WHERE user_id = ? AND couple_id = ? ORDER BY sent_at ASC', userId, coupleId);
  return rows.map(rowToPhoto);
}

export async function savePhotoQueue(userId: string, coupleId: string, photos: LocalPhoto[]) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM photo_queue WHERE user_id = ? AND couple_id = ?', userId, coupleId);
    for (const photo of photos) {
      await db.runAsync(
        `INSERT INTO photo_queue (id, user_id, couple_id, uri, thumbnail_uri, caption_json, sent_at, status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        photo.id,
        userId,
        coupleId,
        photo.photoUrl,
        photo.thumbnailUrl || null,
        photo.caption ? JSON.stringify(photo.caption) : null,
        typeof photo.timestamp === 'string' ? photo.timestamp : new Date().toISOString(),
        photo.localStatus,
        photo.localError || ''
      );
    }
  });
}

export async function loadReviewDraft(key: string): Promise<{ uri: string; thumbnailUri: string | null; captionText: string } | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DraftRow>('SELECT uri, thumbnail_uri, caption_text FROM review_drafts WHERE draft_key = ?', key);
  return row ? { uri: row.uri, thumbnailUri: row.thumbnail_uri, captionText: row.caption_text } : null;
}

function stableDraftId(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `review-draft-${(hash >>> 0).toString(36)}`;
}

function isDurableDraftUri(uri: string) {
  return Boolean(FileSystem.documentDirectory && uri.startsWith(`${FileSystem.documentDirectory}pocofoto-photos/`));
}

export function saveReviewDraft(key: string, uri: string, thumbnailUri: string | null, captionText: string) {
  return queueDraftOperation(key, async () => {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<DraftRow>('SELECT draft_key, uri, thumbnail_uri, caption_text FROM review_drafts WHERE draft_key = ?', key);
    if (existing?.uri && existing.uri !== uri && FileSystem.documentDirectory) {
      await deleteLocalPhotoFile(`${FileSystem.documentDirectory}pocofoto-photos/${stableDraftId(key)}.jpg`);
    }
    const durableUri = existing?.uri === uri && isDurableDraftUri(uri)
      ? uri
      : await copyFileToDurableStorage(uri, stableDraftId(key), 'jpg');
    const durableThumbnailUri = thumbnailUri
      ? existing?.thumbnail_uri === thumbnailUri && isDurableDraftUri(thumbnailUri)
        ? thumbnailUri
        : await copyFileToDurableStorage(thumbnailUri, `${stableDraftId(key)}-thumb`, 'webp')
      : existing?.thumbnail_uri || null;
    if (existing?.uri && existing.uri !== durableUri) await deleteLocalPhotoFile(existing.uri);
    if (existing?.thumbnail_uri && existing.thumbnail_uri !== durableThumbnailUri) await deleteLocalPhotoFile(existing.thumbnail_uri);
    await db.runAsync(
      'INSERT OR REPLACE INTO review_drafts (draft_key, uri, thumbnail_uri, caption_text) VALUES (?, ?, ?, ?)',
      key,
      durableUri,
      durableThumbnailUri,
      captionText
    );
    return { uri: durableUri, thumbnailUri: durableThumbnailUri };
  });
}

export function clearReviewDraft(key: string) {
  return queueDraftOperation(key, async () => {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<DraftRow>('SELECT draft_key, uri, thumbnail_uri, caption_text FROM review_drafts WHERE draft_key = ?', key);
    await db.runAsync('DELETE FROM review_drafts WHERE draft_key = ?', key);
    if (existing?.uri) await deleteLocalPhotoFile(existing.uri);
    if (existing?.thumbnail_uri) await deleteLocalPhotoFile(existing.thumbnail_uri);
  });
}
