import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type ImageStyle, type StyleProp } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react-native';
import { colors } from '../styles/global';

type PhotoSource = { photoUrl?: string | null; thumbnailUrl?: string | null };

export default function NativePhotoImage({ photo, style, preferThumbnail = false }: { photo: PhotoSource; style?: StyleProp<ImageStyle>; preferThumbnail?: boolean }) {
  const { t } = useTranslation('camera');
  const sources = useMemo(() => {
    const orderedSources = preferThumbnail ? [photo.thumbnailUrl, photo.photoUrl] : [photo.photoUrl, photo.thumbnailUrl];
    return Array.from(new Set(orderedSources.filter((value): value is string => Boolean(value))));
  }, [photo.photoUrl, photo.thumbnailUrl, preferThumbnail]);
  const sourceKey = sources.join('|');
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loading, setLoading] = useState(sources.length > 0);
  const [failed, setFailed] = useState(sources.length === 0);

  useEffect(() => {
    setSourceIndex(0);
    setLoading(sources.length > 0);
    setFailed(sources.length === 0);
  }, [sourceKey, sources.length]);

  if (!sources.length) return <View style={[style, styles.fallback]} />;

  if (failed) {
    return (
      <View style={[style, styles.fallback]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('photo.loadRetry')} onPress={() => { setSourceIndex(0); setLoading(sources.length > 0); setFailed(sources.length === 0); }} style={styles.retryButton}>
          <RotateCcw color={colors.text} size={20} />
          <Text style={styles.retryText}>{t('photo.loadRetry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[style, styles.container]}>
      <Image
        accessibilityLabel={t('capturedPreview')}
        onError={() => {
          if (sourceIndex < sources.length - 1) {
            setSourceIndex((current) => current + 1);
            setLoading(true);
          } else {
            setLoading(false);
            setFailed(true);
          }
        }}
        onLoad={() => setLoading(false)}
        resizeMode="cover"
        source={{ uri: sources[sourceIndex] }}
        style={StyleSheet.absoluteFill}
      />
      {loading ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={colors.text} /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)' },
  retryButton: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  retryText: { color: colors.text, fontSize: 12, fontWeight: '700' }
});
