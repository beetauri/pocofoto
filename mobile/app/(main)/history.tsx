import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View, StyleSheet, useWindowDimensions, type ListRenderItemInfo } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { trackEvent } from '../../src/services/analytics';
import { usePhotoContext } from '../../src/state/PhotosProvider';
import NativePhotoImage from '../../src/components/NativePhotoImage';
import { colors, globalStyles, spacing } from '../../src/styles/global';
import type { NativePhoto } from '../../src/types';

const HistoryTile = memo(function HistoryTile({ photo, onPress }: { photo: NativePhoto; onPress: (photoId: string) => void }) {
  const { t } = useTranslation('history');
  const handlePress = useCallback(() => onPress(photo.id), [onPress, photo.id]);
  return (
    <Pressable
      style={styles.tile}
      onPress={handlePress}
      accessibilityLabel={t('openPhoto')}
    >
      <NativePhotoImage photo={photo} preferThumbnail style={styles.image} />
    </Pressable>
  );
});

export default function HistoryRoute() {
  const { t } = useTranslation('history');
  const { photos, loading, loadMore, hasMore, loadingMore } = usePhotoContext();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tileLength = useMemo(() => {
    const safeWidth = typeof width === 'number' && width > 0 ? width : 360;
    return safeWidth / 3;
  }, [width]);

  const handleTilePress = useCallback((photoId: string) => {
    trackEvent('history_photo_opened', { photoId });
    router.navigate({ pathname: '/(main)', params: { photoId } });
  }, []);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<NativePhoto>) => (
    <HistoryTile photo={item} onPress={handleTilePress} />
  ), [handleTilePress]);

  const keyExtractor = useCallback((photo: NativePhoto) => photo.id, []);

  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingMore) void loadMore();
  }, [hasMore, loadMore, loadingMore]);

  const getItemLayout = useCallback((_: ArrayLike<NativePhoto> | null | undefined, index: number) => ({
    length: tileLength,
    offset: tileLength * Math.floor(index / 3),
    index
  }), [tileLength]);

  const listHeader = useMemo(() => <Text style={styles.title}>{t('title')}</Text>, [t]);
  const listFooter = useMemo(
    () => (loadingMore ? <Text style={{ color: colors.muted, textAlign: 'center', padding: spacing.md }}>Loading…</Text> : null),
    [loadingMore]
  );
  const contentStyle = useMemo(
    () => [styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }],
    [insets.top, insets.bottom]
  );

  if (loading) return <View style={[globalStyles.screen, globalStyles.centered]}><Text style={{ color: colors.muted }}>Loading…</Text></View>;
  if (!photos.length) return <View style={[globalStyles.screen, globalStyles.centered, { padding: spacing.xl, gap: spacing.sm }]}><Text style={{ color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>{t('empty.title')}</Text><Text style={{ color: colors.muted, textAlign: 'center' }}>{t('empty.body')}</Text></View>;
  return (
    <View style={globalStyles.screen}>
      <FlatList
        contentContainerStyle={contentStyle}
        directionalLockEnabled
        data={photos}
        keyExtractor={keyExtractor}
        numColumns={3}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialNumToRender={12}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xs },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', padding: spacing.sm },
  tile: { flex: 1 / 3, aspectRatio: 1, padding: 3 },
  image: { width: '100%', height: '100%', borderRadius: 14, borderCurve: 'continuous', backgroundColor: colors.surface }
});
