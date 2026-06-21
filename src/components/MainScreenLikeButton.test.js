import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');

test('like button applies optimistic local state before Firestore writes', () => {
  assert.match(source, /loadMorePhotos,\s*updatePhotoLocal,\s*insertServerPhotoLocal\s*\}\s*=\s*usePaginatedPhotos\(coupleId, localPhotos\)/);
  assert.match(source, /const nextLiked = !isLiked/);
  assert.match(source, /updatePhotoLocal\(photo\.id, \{ liked: nextLiked \}\)/);
  assert.match(
    source,
    /updatePhotoLocal\(photo\.id, \{ liked: nextLiked \}\)[\s\S]*await updateDoc\(photoRef/
  );
});

test('like button rolls back optimistic local state when Firestore write fails', () => {
  assert.match(
    source,
    /catch \(err\) \{\s*updatePhotoLocal\(photo\.id, \{ liked: isLiked \}\);[\s\S]*console\.error\(err\);/
  );
});

test('photo status transition is protected from Chrome translation DOM rewrites', () => {
  assert.match(
    source,
    /<div\s+className="status-chip notranslate"\s+translate="no"\s+aria-label=\{photo\.liked \? t\('photo\.liked'\) : t\('photo\.sent'\)\}\s*>/
  );
});
