export function getNearestFeedSnapTop(scrollTop, slideTops) {
  if (!slideTops.length) return scrollTop;

  return slideTops.reduce((nearest, current) => {
    return Math.abs(current - scrollTop) < Math.abs(nearest - scrollTop) ? current : nearest;
  }, slideTops[0]);
}
