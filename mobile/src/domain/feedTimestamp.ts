import type { NativePhoto } from '../types';

type TranslateFn = (key: string, options?: Record<string, number>) => string;

export function timestampLabel(timestamp: NativePhoto['timestamp'], t: TranslateFn) {
  const date = typeof timestamp === 'object' ? timestamp?.toDate?.() : timestamp ? new Date(timestamp) : null;
  if (!date || Number.isNaN(date.getTime())) return t('time.justNow');
  const diff = Math.max(0, Date.now() - date.getTime()) / 1000;
  if (diff < 60) return t('time.justNow');
  if (diff < 3600) return t('time.minutesAgo', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('time.hoursAgo', { count: Math.floor(diff / 3600) });
  return date.toLocaleDateString();
}
