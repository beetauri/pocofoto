import type { NativePhoto } from '../types';

export const INITIAL_PHOTO_LIMIT = 5;
export const PHOTO_PAGE_SIZE = 10;

export function mergePhotoPages(firstPage: NativePhoto[], olderPages: NativePhoto[][]): NativePhoto[] {
  const output: NativePhoto[] = [];
  const seen = new Set<string>();
  for (const photo of [firstPage, ...olderPages].flat()) {
    if (!photo?.id || seen.has(photo.id)) continue;
    seen.add(photo.id);
    output.push(photo);
  }
  return output;
}

export function mergeServerAndLocalPhotos(serverPhotos: NativePhoto[], localPhotos: NativePhoto[]): NativePhoto[] {
  const serverIds = new Set(serverPhotos.map((photo) => photo.id));
  return [
    ...localPhotos.filter((photo) => photo.localOnly && !serverIds.has(photo.id)),
    ...serverPhotos
  ];
}

export function photoTimestampMs(photo: NativePhoto): number {
  const timestamp = photo.timestamp;
  if (!timestamp) return 0;
  if (typeof timestamp === 'object' && timestamp.toDate) return timestamp.toDate().getTime();
  return new Date(timestamp as string).getTime() || 0;
}
