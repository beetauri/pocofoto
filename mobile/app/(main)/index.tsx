import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BlurTargetView, BlurView } from 'expo-blur';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
  type ViewToken
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flag, Heart, RotateCcw, Send, Trash2 } from 'lucide-react-native';
import { useAppBase } from '../../src/state/AppProvider';
import { useMainUi } from '../../src/state/MainUiProvider';
import { usePhotoContext } from '../../src/state/PhotosProvider';
import NativePhotoImage from '../../src/components/NativePhotoImage';
import { callFunction } from '../../src/services/firebase';
import { timestampLabel } from '../../src/domain/feedTimestamp';
import { colors, globalStyles, spacing } from '../../src/styles/global';
import type { NativePhoto } from '../../src/types';

// Lazy-load the camera/composer bundle (expo-camera + capture pipeline) so the
// feed first paint doesn't pay its parse cost. The camera cell renders behind a
// Suspense fallback until the chunk resolves; feed list behavior is unchanged.
const ReviewComposer = lazy(() => import('./ReviewComposer'));

type FeedItem =
  | { id: 'camera'; kind: 'camera' }
  | { id: 'loading' | 'empty'; kind: 'loading' | 'empty' }
  | { id: string; kind: 'photo'; photo: NativePhoto };

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 58 };

function Page({ height, topInset, bottomInset, children }: { height: number; topInset: number; bottomInset: number; children: ReactNode }) {
  const pageStyle = useMemo(
    () => [styles.page, { height, paddingTop: topInset + 18, paddingBottom: bottomInset + 112 }],
    [height, topInset, bottomInset]
  );
  return <View style={pageStyle}>{children}</View>;
}

const PhotoCard = memo(function PhotoCard({
  photo,
  canLike,
  onLike,
  onRetry,
  onDelete,
  onReport,
  reportBusy,
  canReport,
  imageSize,
  isMine,
  partnerName
}: {
  photo: NativePhoto;
  canLike: boolean;
  onLike: (photo: NativePhoto) => void;
  onRetry: (photoId: string) => void;
  onDelete: (photoId: string) => void;
  onReport: (photo: NativePhoto) => void;
  reportBusy: boolean;
  canReport: boolean;
  imageSize: number;
  isMine: boolean;
  partnerName: string;
}) {
  const { t } = useTranslation('camera');
  const photoFrameRef = useRef<View>(null);
  const failed = photo.localOnly && photo.localStatus === 'failed';

  const timeLabel = useMemo(() => timestampLabel(photo.timestamp, t), [photo.timestamp, t]);
  const cardStyle = useMemo(() => [styles.photoCard, { width: imageSize }], [imageSize]);
  const frameStyle = useMemo(() => [styles.photoFrame, { width: imageSize, height: imageSize }], [imageSize]);
  const metaRowStyle = useMemo(() => [styles.photoMetaRow, { width: imageSize }], [imageSize]);
  const localMetaRowStyle = useMemo(() => [styles.photoMetaRow, styles.localStatusRow, { width: imageSize }], [imageSize]);

  const handleLike = useCallback(() => onLike(photo), [onLike, photo]);
  const handleRetry = useCallback(() => onRetry(photo.id), [onRetry, photo.id]);
  const handleDelete = useCallback(() => onDelete(photo.id), [onDelete, photo.id]);
  const handleReport = useCallback(() => onReport(photo), [onReport, photo]);

  return (
    <View style={cardStyle}>
      <BlurTargetView ref={photoFrameRef} style={frameStyle}>
        <NativePhotoImage photo={photo} style={styles.photoImage} />
        {photo.caption?.text ? (
          <View pointerEvents="none" style={styles.photoCaptionPosition}>
            <BlurView blurMethod="dimezisBlurView" blurTarget={photoFrameRef} intensity={34} tint="dark" style={styles.photoCaptionPill}>
              <Text numberOfLines={1} style={styles.photoCaptionText}>{photo.caption.text}</Text>
            </BlurView>
          </View>
        ) : null}
      </BlurTargetView>
      {photo.localOnly ? (
        <View style={localMetaRowStyle}>
          {failed ? (
            <>
              <Pressable onPress={handleRetry} style={styles.retryTextButton}><RotateCcw color={colors.text} size={17} /><Text style={styles.retryText}>{t('queue.retry')}</Text></Pressable>
              <Pressable accessibilityLabel={t('queue.delete')} onPress={handleDelete} style={styles.deleteTextButton}><Trash2 color={colors.danger} size={18} /></Pressable>
            </>
          ) : <View style={styles.localSending}><ActivityIndicator color={colors.muted} size="small" /><Text style={styles.localSendingText}>{t('queue.sending')}</Text></View>}
        </View>
      ) : (
        <View style={metaRowStyle}>
          <View style={styles.photoMeta}>
            <Text numberOfLines={1} style={styles.photoSender}>{isMine ? t('you') : partnerName}</Text>
            <Text style={styles.photoTime}>{timeLabel}</Text>
          </View>
          {canLike ? (
            <Pressable accessibilityRole="button" accessibilityLabel={photo.liked ? t('photo.unlike') : t('photo.like')} onPress={handleLike} style={styles.likeButton}>
              <Heart color={photo.liked ? colors.accent : colors.text} fill={photo.liked ? colors.accent : 'transparent'} size={23} />
            </Pressable>
          ) : (
            <View accessibilityLabel={photo.liked ? t('photo.liked') : t('photo.sent')} style={styles.sentStatus}>
              {photo.liked ? <Heart color={colors.accent} fill={colors.accent} size={17} /> : <Send color={colors.text} size={17} />}
              <Text style={styles.sentStatusText}>{photo.liked ? t('photo.liked') : t('photo.sent')}</Text>
            </View>
          )}
          {canReport ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('report.action')} disabled={reportBusy} onPress={handleReport} style={[styles.reportButton, reportBusy && styles.controlDisabled]}>
              {reportBusy ? <ActivityIndicator color={colors.text} size="small" /> : <Flag color={colors.text} size={18} />}
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
});

export default function HomeRoute() {
  const { t } = useTranslation(['camera', 'common']);
  const { user, partnerProfile } = useAppBase();
  const { photos, loadMore, hasMore, loading, loadingMore, loadError, retryLocalPhoto, deleteLocalPhoto, likePhoto } = usePhotoContext();
  const [feedback, setFeedback] = useState('');
  const [reportingPhotoId, setReportingPhotoId] = useState<string | null>(null);
  const { cameraInView, setCameraInView } = useMainUi();
  const feedRef = useRef<FlatList<FeedItem>>(null);
  const targetPhotoRef = useRef<string | null>(null);
  const targetPhotoLoadRef = useRef<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigation = useNavigation();
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const imageSize = useMemo(
    () => Math.min(width, Math.max(220, height - insets.top - insets.bottom - 270)),
    [width, height, insets.top, insets.bottom]
  );
  const userId = user?.uid;
  const partnerName = partnerProfile?.displayName || t('yourPerson');

  const { photoId: rawPhotoId } = useLocalSearchParams<{ photoId?: string | string[] }>();
  const photoId = Array.isArray(rawPhotoId) ? rawPhotoId[0] : rawPhotoId;

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(''), 3200);
  }, []);

  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);

  const scrollToCamera = useCallback(() => {
    feedRef.current?.scrollToIndex({ index: 0, animated: true });
  }, []);

  useEffect(() => {
    const tabNavigation = navigation as unknown as {
      addListener: (eventName: 'tabPress', listener: (event: { preventDefault: () => void }) => void) => () => void;
    };
    return tabNavigation.addListener('tabPress', (event) => {
      if (!cameraInView) {
        event.preventDefault();
        scrollToCamera();
      }
    });
  }, [cameraInView, navigation, scrollToCamera]);

  useEffect(() => {
    // Deep-link clear: expo-router setParams types `undefined` as the param-clear
    // value (Record<string, undefined | string | ...>); `null` would be a type error, so keep undefined.
    if (!photoId) {
      targetPhotoRef.current = null;
      targetPhotoLoadRef.current = null;
      return;
    }
    if (loading || targetPhotoRef.current === photoId) return;
    const photoIndex = photos.findIndex((photo) => photo.id === photoId);
    if (photoIndex < 0) {
      if (hasMore && !loadingMore && targetPhotoLoadRef.current !== photoId) {
        targetPhotoLoadRef.current = photoId;
        void loadMore();
      } else if (!hasMore && !loadingMore) {
        targetPhotoLoadRef.current = null;
        router.setParams({ photoId: undefined });
      }
      return;
    }
    targetPhotoRef.current = photoId;
    targetPhotoLoadRef.current = null;
    requestAnimationFrame(() => {
      feedRef.current?.scrollToIndex({ index: photoIndex + 1, animated: false, viewPosition: 0 });
      router.setParams({ photoId: undefined });
    });
  }, [hasMore, loadMore, loading, loadingMore, photoId, photos, router]);

  const submitReport = useCallback(async (photo: NativePhoto, reason: 'abuse' | 'harassment' | 'sexual-content' | 'threats' | 'other') => {
    if (reportingPhotoId) return;
    setReportingPhotoId(photo.id);
    try {
      await callFunction('reportContent', { photoId: photo.id, reason });
      showFeedback(t('report.sent'));
    } catch {
      showFeedback(t('report.error'));
    } finally {
      setReportingPhotoId(null);
    }
  }, [reportingPhotoId, showFeedback, t]);

  const handleReportPhoto = useCallback((photo: NativePhoto) => {
    Alert.alert(t('report.title'), t('report.body'), [
      { text: t('common:actions.cancel'), style: 'cancel' },
      { text: t('report.abuse'), onPress: () => void submitReport(photo, 'abuse') },
      { text: t('report.harassment'), onPress: () => void submitReport(photo, 'harassment') },
      { text: t('report.sexualContent'), onPress: () => void submitReport(photo, 'sexual-content') },
      { text: t('report.threats'), onPress: () => void submitReport(photo, 'threats') },
      { text: t('report.other'), onPress: () => void submitReport(photo, 'other') }
    ]);
  }, [submitReport, t]);

  const handleLikePhoto = useCallback((photo: NativePhoto) => {
    void likePhoto(photo).catch(() => undefined);
  }, [likePhoto]);

  const handleRetryPhoto = useCallback((photoId: string) => {
    retryLocalPhoto(photoId);
  }, [retryLocalPhoto]);

  const handleDeletePhoto = useCallback((photoId: string) => {
    void deleteLocalPhoto(photoId);
  }, [deleteLocalPhoto]);

  const feedItems = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [{ id: 'camera', kind: 'camera' }];
    if (loading) return [...items, { id: 'loading', kind: 'loading' }];
    if (!photos.length) return [...items, { id: 'empty', kind: 'empty' }];
    return [...items, ...photos.map((photo) => ({ id: photo.id, kind: 'photo' as const, photo }))];
  }, [loading, photos]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<FeedItem>[] }) => {
    setCameraInView(viewableItems.some((item) => item.index === 0));
  }, [setCameraInView]);

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingMore) void loadMore();
  }, [hasMore, loadMore, loadingMore]);

  const handleScrollToIndexFailed = useCallback(({ index }: { index: number }) => {
    feedRef.current?.scrollToOffset({ offset: index * height, animated: false });
    requestAnimationFrame(() => feedRef.current?.scrollToIndex({ index, animated: false }));
  }, [height]);

  const getItemLayout = useCallback((_: ArrayLike<FeedItem> | null | undefined, index: number) => (
    { length: height, offset: height * index, index }
  ), [height]);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<FeedItem>) => {
    if (item.kind === 'camera') return <Page height={height} topInset={insets.top} bottomInset={insets.bottom}><Suspense fallback={<ActivityIndicator color={colors.accent} size="large" />}><ReviewComposer imageSize={imageSize} showFeedback={showFeedback} /></Suspense></Page>;
    if (item.kind === 'photo' && item.photo) {
      const canLike = Boolean(item.photo.senderId) && item.photo.senderId !== userId;
      const canReport = Boolean(item.photo.senderId) && item.photo.senderId !== userId;
      return <Page height={height} topInset={insets.top} bottomInset={insets.bottom}><PhotoCard photo={item.photo} canLike={canLike} canReport={canReport} isMine={item.photo.senderId === userId} partnerName={partnerName} onLike={handleLikePhoto} onRetry={handleRetryPhoto} onDelete={handleDeletePhoto} onReport={handleReportPhoto} reportBusy={canReport && reportingPhotoId === item.photo.id} imageSize={imageSize} /></Page>;
    }
    if (item.kind === 'loading') return <Page height={height} topInset={insets.top} bottomInset={insets.bottom}><ActivityIndicator color={colors.accent} size="large" /></Page>;
    return <Page height={height} topInset={insets.top} bottomInset={insets.bottom}><View style={styles.emptyState}><Text style={styles.emptyTitle}>{t('empty.title')}</Text><Text style={styles.emptyBody}>{t('empty.body')}</Text></View></Page>;
  }, [handleDeletePhoto, handleLikePhoto, handleReportPhoto, handleRetryPhoto, height, imageSize, insets.bottom, insets.top, partnerName, reportingPhotoId, showFeedback, t, userId]);

  return (
    <View style={globalStyles.screen}>
      <FlatList
        ref={feedRef}
        data={feedItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        directionalLockEnabled
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        disableIntervalMomentum
        bounces={false}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.65}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        getItemLayout={getItemLayout}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={50}
        windowSize={3}
        removeClippedSubviews
      />
      {loadError ? <Text style={styles.loadError}>{t('photo.loadRetry')}</Text> : null}
      {feedback ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 0, overflow: 'hidden' as const },
  photoFrame: { borderRadius: 44, borderCurve: 'continuous' as const, overflow: 'hidden' as const, backgroundColor: colors.surface },
  photoImage: { width: '100%' as const, height: '100%' as const },
  photoCaptionPosition: { position: 'absolute' as const, left: 0, right: 0, bottom: 8, alignItems: 'center' as const },
  photoCaptionPill: { maxWidth: '88%' as const, minHeight: 42, paddingHorizontal: 18, paddingVertical: 8, justifyContent: 'center' as const, borderRadius: 24, borderCurve: 'continuous' as const, overflow: 'hidden' as const, backgroundColor: 'rgba(31,28,27,0.42)' },
  photoCaptionText: { color: colors.text, fontSize: 16, fontWeight: '500' as const, lineHeight: 22 },
  photoCard: { alignItems: 'center' as const },
  photoMetaRow: { minHeight: 58, paddingTop: 14, paddingHorizontal: 20, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.sm },
  localStatusRow: { justifyContent: 'center' as const, paddingHorizontal: 20 },
  localSending: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: spacing.sm },
  localSendingText: { color: colors.muted, fontSize: 14, fontWeight: '800' as const },
  retryTextButton: { minHeight: 44, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.danger },
  retryText: { color: colors.text, fontSize: 14, fontWeight: '800' as const },
  deleteTextButton: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 22, backgroundColor: 'rgba(255,90,95,0.12)' },
  photoMeta: { flex: 1, minWidth: 0, flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: spacing.sm },
  photoSender: { color: colors.text, flexShrink: 1, fontSize: 18, fontWeight: '800' as const, lineHeight: 22 },
  photoTime: { color: colors.muted, fontSize: 13, fontWeight: '700' as const, fontVariant: ['tabular-nums'] as const },
  likeButton: { width: 54, height: 54, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 27, backgroundColor: 'rgba(22,22,22,0.66)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  sentStatus: { minHeight: 38, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 14, borderRadius: 22, backgroundColor: 'rgba(31,28,27,0.33)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  sentStatusText: { color: colors.text, fontSize: 14, fontWeight: '800' as const },
  reportButton: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 22, backgroundColor: 'rgba(31,28,27,0.42)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  controlDisabled: { opacity: 0.45 },
  emptyState: { alignItems: 'center' as const, gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '900' as const, textAlign: 'center' as const },
  emptyBody: { color: colors.muted, textAlign: 'center' as const },
  loadError: { position: 'absolute' as const, left: spacing.md, right: spacing.md, bottom: spacing.md + 100, color: colors.danger, textAlign: 'center' as const },
  feedback: { position: 'absolute' as const, left: spacing.md, right: spacing.md, bottom: spacing.md + 100, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 16, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, color: colors.text, textAlign: 'center' as const, fontWeight: '700' as const }
});
