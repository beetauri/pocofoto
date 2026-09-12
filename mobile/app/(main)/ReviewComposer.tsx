import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BlurTargetView, BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Flashlight, Send, SwitchCamera, X } from 'lucide-react-native';
import { useApp } from '../../src/state/AppProvider';
import { usePhotoContext } from '../../src/state/PhotosProvider';
import ShutterIcon from '../../src/components/ShutterIcon';
// NOTE: localStore (expo-sqlite/expo-file-system) and photoService
// (expo-image-manipulator) are deliberately NOT statically imported here so the
// feed/history first paint doesn't pay their parse cost. They are loaded via
// dynamic import() only when the capture/draft pipeline actually runs.
import { triggerHaptic } from '../../src/services/haptics';
import { canApplyReviewResult } from '../../src/domain/reviewSession';
import { isCaptionAllowed } from '../../src/domain/captionSafety';
import { colors, globalStyles, spacing } from '../../src/styles/global';

type ReviewPhoto = { uri: string; thumbnailUri: string | null; width: number; height: number };

type PendingDraft = { draftKey: string; uri: string; thumbnailUri: string | null; caption: string };

// Trailing-edge debounce for draft persistence: caption keystrokes only schedule a
// SQLite write, they never write synchronously.
const DRAFT_SAVE_DEBOUNCE_MS = 400;

function ReviewComposerInner({ imageSize, showFeedback }: { imageSize: number; showFeedback: (message: string) => void }) {
  const { t } = useTranslation(['camera', 'common']);
  const { user, coupleId, isOnline } = useApp();
  const { enqueuePhoto } = usePhotoContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [review, setReview] = useState<ReviewPhoto | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [preparingReview, setPreparingReview] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const cameraFrameRef = useRef<View>(null);
  const reviewSessionRef = useRef(0);
  const captionRef = useRef<TextInput>(null);
  const shutterScale = useMemo(() => new Animated.Value(1), []);
  const draftKey = user && coupleId ? `${user.uid}::${coupleId}` : null;
  const captionPillWidth = Math.min(280, Math.max(92, caption.length * 9 + 36));
  const lastSavedDraftRef = useRef<PendingDraft | null>(null);
  const pendingDraftRef = useRef<PendingDraft | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    lastSavedDraftRef.current = null;
    pendingDraftRef.current = null;
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    if (!draftKey) return;
    let active = true;
    const session = reviewSessionRef.current;
    const key = draftKey;
    void import('../../src/services/localStore')
      .then(({ loadReviewDraft }) => loadReviewDraft(key))
      .then((draft) => {
        if (!active || !draft || !canApplyReviewResult(session, reviewSessionRef.current)) return;
        lastSavedDraftRef.current = { draftKey: key, uri: draft.uri, thumbnailUri: draft.thumbnailUri || null, caption: draft.captionText || '' };
        setReview({ uri: draft.uri, thumbnailUri: draft.thumbnailUri || null, width: 1, height: 1 });
        setCaption(draft.captionText || '');
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !review || preparingReview) {
      if (!review) {
        pendingDraftRef.current = null;
        if (draftSaveTimerRef.current) {
          clearTimeout(draftSaveTimerRef.current);
          draftSaveTimerRef.current = null;
        }
      }
      return;
    }
    const snapshot: PendingDraft = { draftKey, uri: review.uri, thumbnailUri: review.thumbnailUri ?? null, caption };
    const last = lastSavedDraftRef.current;
    if (
      last &&
      last.draftKey === snapshot.draftKey &&
      last.uri === snapshot.uri &&
      (last.thumbnailUri ?? null) === (snapshot.thumbnailUri ?? null) &&
      last.caption === snapshot.caption
    ) {
      pendingDraftRef.current = null;
      return;
    }
    pendingDraftRef.current = snapshot;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      const pending = pendingDraftRef.current;
      if (!pending) return;
      const latest = lastSavedDraftRef.current;
      if (
        latest &&
        latest.draftKey === pending.draftKey &&
        latest.uri === pending.uri &&
        (latest.thumbnailUri ?? null) === (pending.thumbnailUri ?? null) &&
        latest.caption === pending.caption
      ) {
        pendingDraftRef.current = null;
        return;
      }
      pendingDraftRef.current = null;
      const session = reviewSessionRef.current;
      const reviewUri = pending.uri;
      void import('../../src/services/localStore')
        .then(({ saveReviewDraft }) => saveReviewDraft(pending.draftKey, pending.uri, pending.thumbnailUri, pending.caption))
        .then(({ uri: durableUri, thumbnailUri }) => {
          lastSavedDraftRef.current = { draftKey: pending.draftKey, uri: durableUri, thumbnailUri, caption: pending.caption };
          if (!canApplyReviewResult(session, reviewSessionRef.current)) return;
          setReview((current) => current?.uri === reviewUri && (current.uri !== durableUri || current.thumbnailUri !== thumbnailUri) ? { ...current, uri: durableUri, thumbnailUri } : current);
        })
        .catch(() => undefined);
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [draftKey, preparingReview, review, caption]);

  // Flush a trailing debounced draft on unmount so navigating away within the
  // debounce window doesn't lose the latest caption. Load/clear semantics are
  // otherwise unchanged.
  useEffect(() => () => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    const pending = pendingDraftRef.current;
    pendingDraftRef.current = null;
    if (!pending) return;
    void import('../../src/services/localStore')
      .then(({ saveReviewDraft }) => saveReviewDraft(pending.draftKey, pending.uri, pending.thumbnailUri, pending.caption))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const capture = async () => {
    if (!cameraRef.current || !cameraReady || busy) return;
    void triggerHaptic('tap');
    setBusy(true);
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false, mirror: false });
      if (!picture?.uri) throw new Error('Capture returned no file.');
      const capturedUri = picture.uri;
      const session = ++reviewSessionRef.current;
      setPreparingReview(true);

      try {
        const { preparePhoto } = await import('../../src/services/photoService');
        const prepared = await preparePhoto(capturedUri, picture.width, picture.height);
        if (!canApplyReviewResult(session, reviewSessionRef.current)) return;
        setReview({ uri: prepared.fullUri, thumbnailUri: prepared.thumbnailUri, width: picture.width, height: picture.height });
        setCaption('');
      } catch {
        if (canApplyReviewResult(session, reviewSessionRef.current)) setReview(null);
        showFeedback(t('errors.capture'));
      } finally {
        if (canApplyReviewResult(session, reviewSessionRef.current)) {
          setPreparingReview(false);
          setBusy(false);
        }
      }
    } catch {
      showFeedback(t('errors.capture'));
      setPreparingReview(false);
      setBusy(false);
    } finally {
      shutterScale.setValue(1);
    }
  };

  const cancelPendingDraftSave = () => {
    pendingDraftRef.current = null;
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
  };

  const send = async () => {
    if (!review || busy || preparingReview) return;
    if (!isCaptionAllowed(caption)) {
      showFeedback(t('errors.captionUnsafe'));
      return;
    }
    void triggerHaptic('tap');
    setBusy(true);
    try {
      await enqueuePhoto({ fullUri: review.uri, thumbnailUri: review.thumbnailUri, caption });
      if (draftKey) {
        const { clearReviewDraft } = await import('../../src/services/localStore');
        await clearReviewDraft(draftKey).catch(() => undefined);
      }
      cancelPendingDraftSave();
      lastSavedDraftRef.current = null;
      setReview(null);
      setCaption('');
      if (!isOnline) showFeedback(t('queue.queued'));
    } catch {
      showFeedback(t('errors.upload'));
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (busy) return;
    reviewSessionRef.current += 1;
    cancelPendingDraftSave();
    lastSavedDraftRef.current = null;
    setBusy(true);
    setReview(null);
    setCaption('');
    try {
      if (draftKey) {
        const { clearReviewDraft } = await import('../../src/services/localStore');
        await clearReviewDraft(draftKey);
      }
    } finally {
      setBusy(false);
    }
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
  };

  const switchCamera = () => {
    setFacing((value) => {
      const nextFacing = value === 'back' ? 'front' : 'back';
      if (nextFacing === 'front') setFlash('off');
      return nextFacing;
    });
  };

  return (
    <>
      <BlurTargetView ref={cameraFrameRef} style={[styles.cameraFrame, keyboardVisible && styles.keyboardCameraFrame, { width: imageSize, height: imageSize }]}>
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
          <View style={[styles.reviewOverlay, keyboardVisible && styles.keyboardReviewOverlay]}>
            <Image fadeDuration={0} source={{ uri: review.uri }} resizeMode="cover" style={styles.photoImage} />
            <View style={styles.captionPosition}>
              <BlurView blurMethod="dimezisBlurView" blurTarget={cameraFrameRef} intensity={38} tint="dark" style={[styles.captionBlur, { width: captionPillWidth }]}>
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
      </BlurTargetView>

      <View style={styles.cameraControls}>
        <Pressable accessibilityLabel={review ? t('review.discard') : t('controls.flash')} onPress={review ? () => void discard() : toggleFlash} style={[styles.cameraToolButton, !review && flash === 'on' && styles.cameraToolButtonActive]}>
          {review ? <X color={colors.text} size={24} /> : <Flashlight color={flash === 'on' ? colors.accent : colors.text} size={24} />}
        </Pressable>
        <Animated.View style={[styles.shutterAnimated, { transform: [{ scale: shutterScale }] }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={review ? t('review.send') : t('controls.capture')} disabled={busy || preparingReview || (!review && !cameraReady)} onPress={() => void (review ? send() : capture())} onPressIn={() => animateShutter(0.92)} onPressOut={() => animateShutter(1)} style={({ pressed }) => [styles.shutterButton, (busy || preparingReview || (!review && !cameraReady)) && styles.controlDisabled, pressed && styles.controlPressed]}>
            <ShutterIcon size={88} />
            {review && !busy && !preparingReview ? <SendIcon /> : null}
            {busy || preparingReview ? <ActivityIndicator color="#111111" size="small" style={styles.shutterOverlayIcon} /> : null}
          </Pressable>
        </Animated.View>
        <Pressable accessibilityLabel={review ? t('review.addCaption') : t('controls.switchCamera')} onPress={review ? () => captionRef.current?.focus() : switchCamera} style={styles.cameraToolButton}>
          {review ? <Text style={styles.captionTool}>Aa</Text> : <SwitchCamera color={colors.text} size={24} />}
        </Pressable>
      </View>
    </>
  );
}

function SendIcon() {
  return <Send color="#111111" size={27} style={styles.shutterOverlayIcon} />;
}

const ReviewComposer = memo(ReviewComposerInner);
export default ReviewComposer;

const styles = StyleSheet.create({
  cameraFrame: { borderRadius: 44, borderCurve: 'continuous' as const, overflow: 'hidden' as const, backgroundColor: colors.surface },
  keyboardCameraFrame: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  camera: { flex: 1 },
  reviewOverlay: { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0, borderRadius: 44, borderCurve: 'continuous' as const, overflow: 'hidden' as const, backgroundColor: colors.background },
  keyboardReviewOverlay: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  photoImage: { width: '100%' as const, height: '100%' as const },
  permissionState: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  permissionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' as const, textAlign: 'center' as const },
  permissionBody: { color: colors.muted, textAlign: 'center' as const },
  cameraErrorOverlay: { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center' as const, justifyContent: 'center' as const, gap: spacing.sm, padding: spacing.lg, backgroundColor: 'rgba(17,17,17,0.96)' },
  buttonText: { color: colors.text, fontWeight: '800' as const },
  captionPosition: { position: 'absolute' as const, left: 26, right: 26, bottom: 8, alignItems: 'center' as const },
  captionBlur: { alignSelf: 'center' as const, minHeight: 42, maxWidth: '100%' as const, borderRadius: 24, borderCurve: 'continuous' as const, overflow: 'hidden' as const, backgroundColor: 'rgba(31,28,27,0.42)' },
  captionInput: { minHeight: 42, paddingHorizontal: 18, paddingVertical: 8, color: colors.text, fontSize: 16, fontWeight: '500' as const, backgroundColor: 'transparent', textAlignVertical: 'center' as const },
  cameraControls: { width: '100%' as const, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  cameraToolButton: { width: 54, height: 54, borderRadius: 27, borderCurve: 'continuous' as const, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.surfaceRaised },
  cameraToolButtonActive: { backgroundColor: 'rgba(79,114,252,0.18)', borderWidth: 1, borderColor: 'rgba(79,114,252,0.42)' },
  captionTool: { color: colors.text, fontSize: 19, fontWeight: '900' as const },
  shutterAnimated: { width: 88, height: 88 },
  shutterButton: { width: 88, height: 88, borderRadius: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  shutterOverlayIcon: { position: 'absolute' as const },
  controlDisabled: { opacity: 0.45 },
  controlPressed: { opacity: 0.72 }
});
