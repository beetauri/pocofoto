export const INITIAL_PHOTO_LIMIT = 5;
export const PHOTO_PAGE_SIZE = 10;

export function mergePhotoPages(firstPage, olderPages) {
  const seen = new Set();
  return [firstPage, ...olderPages].flat().filter((photo) => {
    if (!photo?.id || seen.has(photo.id)) return false;
    seen.add(photo.id);
    return true;
  });
}
