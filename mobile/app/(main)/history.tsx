import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { trackEvent } from '../../src/services/analytics';
import { usePhotoContext } from '../../src/state/PhotosProvider';
import NativePhotoImage from '../../src/components/NativePhotoImage';
import { colors, globalStyles, spacing } from '../../src/styles/global';

export default function HistoryRoute() {
  const { t } = useTranslation('history');
  const { photos, loading, loadMore, hasMore, loadingMore } = usePhotoContext();
  const insets = useSafeAreaInsets();
  if (loading) return <View style={[globalStyles.screen, globalStyles.centered]}><Text style={{ color: colors.muted }}>Loading…</Text></View>;
  if (!photos.length) return <View style={[globalStyles.screen, globalStyles.centered, { padding: spacing.xl, gap: spacing.sm }]}><Text style={{ color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>{t('empty.title')}</Text><Text style={{ color: colors.muted, textAlign: 'center' }}>{t('empty.body')}</Text></View>;
  return (
    <View style={globalStyles.screen}>
      <FlatList
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }]}
        directionalLockEnabled
        data={photos}
        keyExtractor={(photo) => photo.id}
        numColumns={3}
        onEndReached={() => { if (hasMore && !loadingMore) void loadMore(); }}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => (
          <Pressable
            style={styles.tile}
            onPress={() => { trackEvent('history_photo_opened', { photoId: item.id }); router.navigate({ pathname: '/(main)', params: { photoId: item.id } }); }}
            accessibilityLabel={t('openPhoto')}
          >
            <NativePhotoImage photo={item} preferThumbnail style={styles.image} />
          </Pressable>
        )}
        ListHeaderComponent={<Text style={styles.title}>{t('title')}</Text>}
        ListFooterComponent={loadingMore ? <Text style={{ color: colors.muted, textAlign: 'center', padding: spacing.md }}>Loading…</Text> : null}
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
