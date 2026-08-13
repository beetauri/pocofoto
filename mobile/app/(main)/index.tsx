import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
  type ViewToken
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flashlight, Heart, RotateCcw, Send, SwitchCamera, Trash2, X } from 'lucide-react-native';
import { useApp } from '../../src/state/AppProvider';
import { useMainUi } from '../../src/state/MainUiProvider';
import { usePhotoContext } from '../../src/state/PhotosProvider';
import NativePhotoImage from '../../src/components/NativePhotoImage';
import ShutterIcon from '../../src/components/ShutterIcon';
import { saveReviewDraft, clearReviewDraft, loadReviewDraft } from '../../src/services/localStore';
import { preparePhoto } from '../../src/services/photoService';
import { triggerHaptic } from '../../src/services/haptics';
import { colors, globalStyles, spacing } from '../../src/styles/global';
import type { NativePhoto } from '../../src/types';

type ReviewPhoto = { uri: string; thumbnailUri: string | null; width: number; height: number };
type FeedItem =
  | { id: 'camera'; kind: 'camera' }
  | { id: 'loading' | 'empty'; kind: 'loading' | 'empty' }
  | { id: string; kind: 'photo'; photo: NativePhoto };

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 58 };

function timestampLabel(timestamp: NativePhoto['timestamp'], t: (key: string, options?: Record<string, number>) => string) {
  const date = typeof timestamp === 'object' ? timestamp?.toDate?.() : timestamp ? new Date(timestamp) : null;
  if (!date || Number.isNaN(date.getTime())) return t('time.justNow');
  const diff = Math.max(0, Date.now() - date.getTime()) / 1000;
  if (diff < 60) return t('time.justNow');
  if (diff < 3600) return t('time.minutesAgo', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('time.hoursAgo', { count: Math.floor(diff / 3600) });
  return date.toLocaleDateString();
}

function Page({ height, topInset, bottomInset, children }: { height: number; topInset: number; bottomInset: number; children: ReactNode }) {
  return <View style={[styles.page, { height, paddingTop: topInset + 18, paddingBottom: bottomInset + 112 }]}>{children}</View>;
}

const PhotoCard = memo(function PhotoCard({
  photo,
  canLike,
  onLike,
  onRetry,
  onDelete,
  imageSize,
  isMine,
  partnerName
}: {
  photo: NativePhoto;
  canLike: boolean;
  onLike: () => void;
  onRetry: () => void;
  onDelete: () => void;
  imageSize: number;
  isMine: boolean;
  partnerName: string;
}) {
  const { t } = useTranslation('camera');
  const failed = photo.localOnly && photo.localStatus === 'failed';

  return (
    <View style={[styles.photoCard, { width: imageSize }]}>
      <View style={[styles.photoFrame, { width: imageSize, height: imageSize }]}>
        <NativePhotoImage photo={photo} style={styles.photoImage} />
        {photo.caption?.text ? (
          <View pointerEvents="none" style={styles.photoCaptionPosition}>
            <BlurView intensity={34} tint="dark" style={styles.photoCaptionPill}>
              <Text numberOfLines={1} style={styles.photoCaptionText}>{photo.caption.text}</Text>
            </BlurView>
          </View>
        ) : null}
      </View>
      {photo.localOnly ? (
        <View style={[styles.photoMetaRow, styles.localStatusRow, { width: imageSize }]}> 
          {failed ? (
            <>
              <Pressable onPress={onRetry} style={styles.retryTextButton}><RotateCcw color={colors.text} size={17} /><Text style={styles.retryText}>{t('queue.retry')}</Text></Pressable>
              <Pressable accessibilityLabel={t('queue.delete')} onPress={onDelete} style={styles.deleteTextButton}><Trash2 color={colors.danger} size={18} /></Pressable>
            </>
          ) : <View style={styles.localSending}><ActivityIndicator color={colors.muted} size="small" /><Text style={styles.localSendingText}>{t('queue.sending')}</Text></View>}
        </View>
      ) : (
        <View style={[styles.photoMetaRow, { width: imageSize }]}> 
          <View style={styles.photoMeta}>
            <Text numberOfLines={1} style={styles.photoSender}>{isMine ? t('you') : partnerName}</Text>
            <Text style={styles.photoTime}>{timestampLabel(photo.timestamp, t)}</Text>
          </View>
          {canLike ? (
            <Pressable accessibilityRole="button" accessibilityLabel={photo.liked ? t('photo.unlike') : t('photo.like')} onPress={onLike} style={styles.likeButton}>
              <Heart color={photo.liked ? colors.accent : colors.text} fill={photo.liked ? colors.accent : 'transparent'} size={23} />
            </Pressable>
          ) : (
            <View accessibilityLabel={photo.liked ? t('photo.liked') : t('photo.sent')} style={styles.sentStatus}>
              {photo.liked ? <Heart color={colors.accent} fill={colors.accent} size={17} /> : <Send color={colors.text} size={17} />}
              <Text style={styles.sentStatusText}>{photo.liked ? t('photo.liked') : t('photo.sent')}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
});

export default function HomeRoute() {
  const { t } = useTranslation('camera');
  const { user, coupleId, partnerProfile, isOnline } = useApp();
  const { photos, loadMore, hasMore, loading, loadingMore, loadError, enqueuePhoto, retryLocalPhoto, deleteLocalPhoto, likePhoto } = usePhotoContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [review, setReview] = useState<ReviewPhoto | null>(null);
  const [caption, setCaption] = useState('');
  const [captionWidth, setCaptionWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [preparingReview, setPreparingReview] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const { cameraInView, setCameraInView } = useMainUi();
  const cameraRef = useRef<CameraView>(null);
  const captionRef = useRef<TextInput>(null);
  const feedRef = useRef<FlatList<FeedItem>>(null);
  const targetPhotoRef = useRef<string | null>(null);
  const targetPhotoLoadRef = useRef<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shutterScale = useRef(new Animated.Value(1)).current;
  const navigation = useNavigation();
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const draftKey = user && coupleId ? `${user.uid}::${coupleId}` : null;
  const imageSize = Math.min(width, Math.max(220, height - insets.top - insets.bottom - 270));
  const maxCaptionWidth = Math.max(140, imageSize - 52);

  const { photoId: rawPhotoId } = useLocalSearchParams<{ photoId?: string | string[] }>();
  const photoId = Array.isArray(rawPhotoId) ? rawPhotoId[0] : rawPhotoId;

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!draftKey) return;
    let active = true;
    void loadReviewDraft(draftKey).then((draft) => {
      if (!active || !draft) return;
      setReview({ uri: draft.uri, thumbnailUri: draft.thumbnailUri || null, width: 1, height: 1 });
      setCaption(draft.captionText || '');
    });
    return () => { active = false; };
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !review || preparingReview) return;
    const reviewUri = review.uri;
    void saveReviewDraft(draftKey, reviewUri, review.thumbnailUri, caption).then(({ uri: durableUri, thumbnailUri }) => {
      setReview((current) => current?.uri === reviewUri && (current.uri !== durableUri || current.thumbnailUri !== thumbnailUri) ? { ...current, uri: durableUri, thumbnailUri } : current);
    }).catch(() => undefined);
  }, [draftKey, preparingReview, review, caption]);

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

  const capture = async () => {
    if (!cameraRef.current || !cameraReady || busy) return;
    await triggerHaptic('tap');
    setBusy(true);
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (!picture?.uri) throw new Error('Capture returned no file.');
      const capturedUri = picture.uri;
      setReview({ uri: capturedUri, thumbnailUri: null, width: picture.width, height: picture.height });
      setCaption('');
      setCaptionWidth(0);
      setPreparingReview(true);
      setBusy(false);

      try {
        const prepared = await preparePhoto(capturedUri, picture.width, picture.height);
        setReview((current) => current?.uri === capturedUri ? { ...current, uri: prepared.fullUri, thumbnailUri: prepared.thumbnailUri } : current);
      } catch {
        setReview(null);
        showFeedback(t('errors.capture'));
      } finally {
        setPreparingReview(false);
      }
    } catch {
      showFeedback(t('errors.capture'));
      setPreparingReview(false);
      setBusy(false);
    } finally {
      shutterScale.setValue(1);
    }
  };

  const send = async () => {
    if (!review || busy || preparingReview) return;
    if (!isOnline) {
      showFeedback(t('errors.offlineSend'));
      return;
    }
    await triggerHaptic('tap');
    setBusy(true);
    try {
      await enqueuePhoto({ fullUri: review.uri, thumbnailUri: review.thumbnailUri, caption });
      if (draftKey) await clearReviewDraft(draftKey).catch(() => undefined);
      setReview(null);
      setCaption('');
      setCaptionWidth(0);
    } catch {
      showFeedback(t('errors.upload'));
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (busy) return;
    setReview(null);
    setCaption('');
    setCaptionWidth(0);
    if (draftKey) await clearReviewDraft(draftKey);
  };

  const retryCamera = () => {
    setCameraReady(false);
    setCameraError('');
    setCameraAttempt((current) => current + 1);
  };

  const animateShutter = (toValue: number) => {
    Animated.spring(shutterScale, {
      toValue,
      useNativeDriver: true,
      speed: 26,
      bounciness: 5
    }).start();
  };

  const toggleFlash = () => {
    const nextFlash: FlashMode = flash === 'on' ? 'off' : 'on';
    setFlash(nextFlash);
    showFeedback(nextFlash === 'on' ? 'Flash on' : 'Flash off');
  };

  const switchCamera = () => {
    setFacing((value) => {
      const nextFacing = value === 'back' ? 'front' : 'back';
      if (nextFacing === 'front') setFlash('off');
      return nextFacing;
    });
  };

  const feedItems = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [{ id: 'camera', kind: 'camera' }];
    if (loading) return [...items, { id: 'loading', kind: 'loading' }];
    if (!photos.length) return [...items, { id: 'empty', kind: 'empty' }];
    return [...items, ...photos.map((photo) => ({ id: photo.id, kind: 'photo' as const, photo }))];
  }, [loading, photos]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<FeedItem>[] }) => {
    setCameraInView(viewableItems.some((item) => item.index === 0));
  }, [setCameraInView]);

  const renderCamera = () => (
    <>
      <View style={[styles.cameraFrame, { width: imageSize, height: imageSize }]}>
        {permission?.granted ? (
          <CameraView
            key={cameraAttempt}
            ref={cameraRef}
            style={styles.camera}
            active={!review}
            facing={facing}
            flash={flash}
            mirror={false}
            onCameraReady={() => { setCameraReady(true); setCameraError(''); }}
            onMountError={(event) => { setCameraReady(false); setCameraError(event.message || t('errors.start')); showFeedback(event.message || t('errors.start')); }}
          />
        ) : (
          <View style={[globalStyles.centered, styles.permissionState]}>
            <Text style={styles.permissionTitle}>{t(permission?.canAskAgain === false ? 'startup.blocked' : 'startup.title')}</Text>
            <Text style={styles.permissionBody}>{t(permission?.canAskAgain === false ? 'errors.denied' : 'startup.body')}</Text>
            {permission?.canAskAgain ? <Pressable onPress={() => void requestPermission()} style={[globalStyles.button, globalStyles.buttonPrimary]}><Text style={styles.buttonText}>{t('startup.retry')}</Text></Pressable> : null}
          </View>
        )}
        {cameraError && !review ? <View style={styles.cameraErrorOverlay}><Text style={styles.permissionTitle}>{t('startup.unavailable')}</Text><Text style={styles.permissionBody}>{cameraError}</Text><Pressable onPress={retryCamera} style={[globalStyles.button, globalStyles.buttonPrimary]}><Text style={styles.buttonText}>{t('startup.retry')}</Text></Pressable></View> : null}
        {review ? (
          <View style={styles.reviewOverlay}>
            <Image source={{ uri: review.uri }} resizeMode="cover" style={styles.photoImage} />
            <View style={styles.captionPosition}>
              <View pointerEvents="none" style={styles.captionSizer} onLayout={(event) => setCaptionWidth(Math.min(maxCaptionWidth, event.nativeEvent.layout.width))}>
                <Text numberOfLines={1} style={styles.captionSizerText}>{caption || t('review.captionPlaceholder')}</Text>
              </View>
              <BlurView intensity={38} tint="dark" style={[styles.captionBlur, { width: captionWidth || Math.min(maxCaptionWidth, 230) }]}>
                <TextInput
                  ref={captionRef}
                  accessibilityLabel={t('review.captionLabel')}
                  blurOnSubmit
                  keyboardAppearance="dark"
                  maxLength={36}
                  multiline={false}
                  onChangeText={setCaption}
                  onSubmitEditing={() => captionRef.current?.blur()}
                  placeholder={t('review.captionPlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.58)"
                  returnKeyType="done"
                  selectionColor={colors.accent}
                  style={styles.captionInput}
                  textAlign="center"
                  underlineColorAndroid="transparent"
                  value={caption}
                />
              </BlurView>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.cameraControls}>
        <Pressable accessibilityLabel={review ? t('review.discard') : t('controls.flash')} onPress={review ? () => void discard() : toggleFlash} style={[styles.cameraToolButton, !review && flash === 'on' && styles.cameraToolButtonActive]}>
          {review ? <X color={colors.text} size={24} /> : <Flashlight color={flash === 'on' ? colors.accent : colors.text} size={24} />}
        </Pressable>
        <Animated.View style={[styles.shutterAnimated, { transform: [{ scale: shutterScale }] }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={review ? t('review.send') : t('controls.capture')} disabled={busy || preparingReview || (!review && !cameraReady) || (Boolean(review) && !isOnline)} onPress={() => void (review ? send() : capture())} onPressIn={() => animateShutter(0.92)} onPressOut={() => animateShutter(1)} style={({ pressed }) => [styles.shutterButton, (busy || preparingReview || (!review && !cameraReady) || (Boolean(review) && !isOnline)) && styles.controlDisabled, pressed && styles.controlPressed]}>
            <ShutterIcon size={88} />
            {review && !busy && !preparingReview ? <Send color="#111111" size={27} style={styles.shutterOverlayIcon} /> : null}
            {busy || preparingReview ? <ActivityIndicator color="#111111" size="small" style={styles.shutterOverlayIcon} /> : null}
          </Pressable>
        </Animated.View>
        <Pressable accessibilityLabel={review ? t('review.addCaption') : t('controls.switchCamera')} onPress={review ? () => captionRef.current?.focus() : switchCamera} style={styles.cameraToolButton}>
          {review ? <Text style={styles.captionTool}>Aa</Text> : <SwitchCamera color={colors.text} size={24} />}
        </Pressable>
      </View>
    </>
  );

  const renderItem = ({ item }: ListRenderItemInfo<FeedItem>) => {
    if (item.kind === 'camera') return <Page height={height} topInset={insets.top} bottomInset={insets.bottom}>{renderCamera()}</Page>;
    if (item.kind === 'photo' && item.photo) {
      const canLike = Boolean(item.photo.senderId) && item.photo.senderId !== user?.uid;
      return <Page height={height} topInset={insets.top} bottomInset={insets.bottom}><PhotoCard photo={item.photo} canLike={canLike} isMine={item.photo.senderId === user?.uid} partnerName={partnerProfile?.displayName || t('yourPerson')} onLike={() => void likePhoto(item.photo).catch(() => undefined)} onRetry={() => retryLocalPhoto(item.photo?.id || item.id)} onDelete={() => void deleteLocalPhoto(item.photo?.id || item.id)} imageSize={imageSize} /></Page>;
    }
    if (item.kind === 'loading') return <Page height={height} topInset={insets.top} bottomInset={insets.bottom}><ActivityIndicator color={colors.accent} size="large" /></Page>;
    return <Page height={height} topInset={insets.top} bottomInset={insets.bottom}><View style={styles.emptyState}><Text style={styles.emptyTitle}>{t('empty.title')}</Text><Text style={styles.emptyBody}>{t('empty.body')}</Text></View></Page>;
  };

  return (
    <View style={globalStyles.screen}>
      <FlatList
        ref={feedRef}
        data={feedItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        directionalLockEnabled
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        disableIntervalMomentum
        bounces={false}
        onEndReached={() => { if (hasMore && !loadingMore) void loadMore(); }}
        onEndReachedThreshold={0.65}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        onScrollToIndexFailed={({ index }) => {
          feedRef.current?.scrollToOffset({ offset: index * height, animated: false });
          requestAnimationFrame(() => feedRef.current?.scrollToIndex({ index, animated: false }));
        }}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={50}
        windowSize={3}
      />
      {loadError ? <Text style={styles.loadError}>{t('photo.loadRetry')}</Text> : null}
      {feedback ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 0, overflow: 'hidden' as const },
  cameraFrame: { borderRadius: 44, borderCurve: 'continuous' as const, overflow: 'hidden' as const, backgroundColor: colors.surface },
  camera: { flex: 1 },
  reviewOverlay: { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0, borderRadius: 44, borderCurve: 'continuous' as const, overflow: 'hidden' as const, backgroundColor: colors.background },
  photoFrame: { borderRadius: 44, borderCurve: 'continuous' as const, overflow: 'hidden' as const, backgroundColor: colors.surface },
  photoImage: { width: '100%' as const, height: '100%' as const },
  photoCaptionPosition: { position: 'absolute' as const, left: 0, right: 0, bottom: 8, alignItems: 'center' as const },
  photoCaptionPill: { maxWidth: '88%' as const, minHeight: 42, paddingHorizontal: 18, paddingVertical: 8, justifyContent: 'center' as const, borderRadius: 24, borderCurve: 'continuous' as const, overflow: 'hidden' as const, backgroundColor: 'rgba(31,28,27,0.33)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
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
  permissionState: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  permissionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' as const, textAlign: 'center' as const },
  permissionBody: { color: colors.muted, textAlign: 'center' as const },
  cameraErrorOverlay: { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center' as const, justifyContent: 'center' as const, gap: spacing.sm, padding: spacing.lg, backgroundColor: 'rgba(17,17,17,0.96)' },
  buttonText: { color: colors.text, fontWeight: '800' as const },
  captionPosition: { position: 'absolute' as const, left: 26, right: 26, bottom: 8, alignItems: 'center' as const },
  captionSizer: { position: 'absolute' as const, alignSelf: 'center' as const, opacity: 0 },
  captionSizerText: { minHeight: 42, paddingHorizontal: 18, paddingVertical: 8, fontSize: 16, fontWeight: '500' as const },
  captionBlur: { minHeight: 42, borderRadius: 24, borderCurve: 'continuous' as const, overflow: 'hidden' as const, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(31,28,27,0.33)' },
  captionInput: { minHeight: 42, paddingHorizontal: 18, paddingVertical: 8, color: colors.text, fontSize: 16, fontWeight: '500' as const, backgroundColor: 'transparent' },
  cameraControls: { width: '100%' as const, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  cameraToolButton: { width: 54, height: 54, borderRadius: 27, borderCurve: 'continuous' as const, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.surfaceRaised },
  cameraToolButtonActive: { backgroundColor: 'rgba(79,114,252,0.18)', borderWidth: 1, borderColor: 'rgba(79,114,252,0.42)' },
  captionTool: { color: colors.text, fontSize: 19, fontWeight: '900' as const },
  shutterAnimated: { width: 88, height: 88 },
  shutterButton: { width: 88, height: 88, borderRadius: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  shutterOverlayIcon: { position: 'absolute' as const },
  controlDisabled: { opacity: 0.45 },
  controlPressed: { opacity: 0.72 },
  emptyState: { alignItems: 'center' as const, gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '900' as const, textAlign: 'center' as const },
  emptyBody: { color: colors.muted, textAlign: 'center' as const },
  loadError: { position: 'absolute' as const, left: spacing.md, right: spacing.md, bottom: spacing.md + 100, color: colors.danger, textAlign: 'center' as const },
  feedback: { position: 'absolute' as const, left: spacing.md, right: spacing.md, bottom: spacing.md + 100, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 16, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, color: colors.text, textAlign: 'center' as const, fontWeight: '700' as const }
});
