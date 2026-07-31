import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet, ScrollView, Image, Animated } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { useLanguage } from '../i18n/LanguageContext';
import { getProfile, saveProfile, clearProfile } from '../storage/profileStore';
import { requestFolderAccess, findChildUri, KUTTA_GAMES_FOLDER_NAME } from '../storage/folderAccess';
import { migrateContent } from '../storage/folderMigration';
import { toReadableFolderPath } from '../storage/folderPathDisplay';
import { AgePicker } from '../components/AgePicker';
import { LanguageSelector } from '../components/LanguageSelector';
import { ProfilePicturePicker } from './ProfilePicturePicker';
import type { Profile } from '../types/profile';
import { colors, radii, spacing, elevation, typography, motion, parentPaperTheme } from '../design-system';

// This screen deliberately renders in Kutta's CALMER "parent" register (see
// `colors.parent`/`parentPaperTheme` in `src/design-system/`) rather than the
// playful bubblegum/violet/jade child-facing palette — a parent scanning
// this screen quickly to fix a name typo or swap the content folder
// shouldn't be fighting toy colors or bouncy tilt animations to do it. A
// local <PaperProvider> wraps just this screen's subtree (per
// paperTheme.ts's own guidance) so it never needs App.tsx's top-level
// PaperProvider to change, and every other screen keeps the playful theme
// untouched.
//
// Only the PRESENTATION changed in this redesign pass: every handler below
// (staged-not-eager-save, migration confirm/progress/error, picture
// choose/remove) is untouched from the previous version, and the
// tight-fit spacing regression test in
// __tests__/settings/SettingsScreen.test.tsx (a Galaxy-S22-driven fix for
// excessive scrolling) is still honored by the title's spacing values below.

// A plain opacity fade-in (no spring, no bounce) for the migrating/error
// banners — "subtle, calm transition" per this screen's brief, as opposed to
// the design-system's popBouncy/celebrate presets used on child-facing
// screens. Renders nothing extra when not mounted; the parent still controls
// whether the banner exists at all via a `&&` guard, this only animates its
// entrance.
function FadeInBanner({
  children,
  style,
  testID,
}: { children: React.ReactNode; style: object; testID?: string }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: motion.duration.base,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View testID={testID} style={[style, { opacity }]}>
      {children}
    </Animated.View>
  );
}

// How long the "Saved successfully" toast stays up before this screen
// navigates back to Home on its own — long enough for a parent to actually
// read it, short enough not to feel like the app is stuck after a tap.
const SAVED_TOAST_DURATION_MS = 1200;

export function SettingsScreen({
  onProfileChanged,
  onGoHome,
  onReset,
  picturesFolderUri,
}: {
  onProfileChanged?: () => void;
  onGoHome?: () => void;
  // Called after the parent confirms "Reset" and everything has been wiped
  // (content folder + saved profile) — RootNavigator wires this to send the
  // app back to onboarding, the same way a genuinely first-ever launch would.
  onReset?: () => void;
  picturesFolderUri?: string;
} = {}) {
  const { t, setLanguage } = useLanguage();
  // Shown with headerShown:true (see RootNavigator), so the native header
  // already covers the top inset — only left/right/bottom are ours to
  // handle (a notch or gesture-nav bar sits at one of the sides in this
  // landscape-only app).
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [ageModalVisible, setAgeModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [pendingFolderUri, setPendingFolderUri] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  // The current profile-picture preview can go stale exactly like every
  // other locally-referenced photo this app shows (file deleted, SD card
  // unmounted, SAF grant revoked) — track a load failure so a broken-image
  // icon never gets shown in its place, same reasoning as
  // resolveProfilePictureUri (src/storage/profilePicture.ts), which the
  // Home screen side of this feature uses for the same file.
  const [previewFailed, setPreviewFailed] = useState(false);
  const [savedToastVisible, setSavedToastVisible] = useState(false);
  const [resetting, setResetting] = useState(false);
  const goHomeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards handleSave against a rapid double-tap on Save — same idiom as
  // PuzzleScreen's retryFiredRef/nextFiredRef. Without this, tapping Save
  // twice quickly (trivial for a child) re-enters handleSave a second time
  // while the first call is still awaiting saveProfile(); the previous
  // `disabled={migrating}` guard only actually engaged during a folder
  // migration, so the common "just edited name/age" case had no protection
  // at all — each call scheduled its own goHomeTimeoutRef, silently
  // orphaning the first timer, and both eventually fired onGoHome?.(),
  // navigating Home twice.
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      if (goHomeTimeoutRef.current) clearTimeout(goHomeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    getProfile().then((p) => {
      setProfile(p);
      if (p) setAge(p.age);
    });
  }, []);

  // Reset the stale-preview flag whenever the picture itself changes (a new
  // pick, a remove, or the profile reloading) — a failure recorded against
  // the OLD uri must never keep hiding the preview for a newly-picked one.
  useEffect(() => {
    setPreviewFailed(false);
  }, [profile?.pictureUri]);

  function handleChoosePicture() {
    setPickerVisible(true);
  }

  function handlePictureSelected(uri: string) {
    if (!profile) return;
    // Staged into local `profile` state exactly like name/age/language
    // above — not persisted until "Save changes" is pressed. This keeps a
    // mis-tap on a thumbnail low-stakes (nothing is written to storage
    // until the parent explicitly confirms), matching this screen's
    // existing edit-then-save convention rather than writing immediately.
    setProfile({ ...profile, pictureUri: uri });
    setPickerVisible(false);
  }

  function handleRemovePicture() {
    if (!profile) return;
    setProfile({ ...profile, pictureUri: undefined });
  }

  async function handlePickFolder() {
    try {
      const uri = await requestFolderAccess();
      setPendingFolderUri(uri);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    }
  }

  // Wraps Alert.alert's Cancel/Confirm buttons in a Promise so the caller can
  // simply `await` the user's decision before doing anything destructive.
  function confirmMigration(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(
        t('migrationConfirmTitle'),
        t('migrationConfirmBody'),
        [
          { text: t('migrationConfirmCancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('migrationConfirmConfirm'), onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    });
  }

  function handleReset() {
    if (!profile || resetting) return;
    Alert.alert(
      t('settingsResetConfirmTitle'),
      t('settingsResetConfirmBody'),
      [
        { text: t('cancel'), style: 'cancel', onPress: () => {} },
        { text: t('settingsReset'), style: 'destructive', onPress: performReset },
      ],
      { cancelable: true }
    );
  }

  async function performReset() {
    setResetting(true);
    try {
      if (profile?.rootFolderUri) {
        // Best-effort: if the Kutta-games folder can't be found or deleted
        // (SAF grant already revoked, folder already gone), the profile is
        // still cleared below — a parent asking to reset should never get
        // stuck here over a folder that's already missing.
        const gamesUri = await findChildUri(profile.rootFolderUri, KUTTA_GAMES_FOLDER_NAME).catch(() => null);
        if (gamesUri) {
          await FileSystem.StorageAccessFramework.deleteAsync(gamesUri, { idempotent: true }).catch(() => {});
        }
      }
      await clearProfile();
      onReset?.();
    } finally {
      setResetting(false);
    }
  }

  async function handleSave() {
    if (!profile || migrating || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    try {
      setMigrationError(null);

      let nextProfile: Profile = {
        ...profile,
        age: age !== null ? age : profile.age,
      };

      if (pendingFolderUri && pendingFolderUri !== profile.rootFolderUri) {
        const oldUri = profile.rootFolderUri;

        if (oldUri) {
          const confirmed = await confirmMigration();
          if (!confirmed) return;
        }

        setMigrating(true);
        const result = oldUri
          ? await migrateContent(oldUri, pendingFolderUri)
          : ({ success: true } as const);
        setMigrating(false);

        if (!result.success) {
          setMigrationError(t('migrationFailed'));
          return;
        }
        nextProfile = { ...nextProfile, rootFolderUri: pendingFolderUri };
      }

      await saveProfile(nextProfile);
      setProfile(nextProfile);
      setLanguage(nextProfile.language);
      onProfileChanged?.();

      setSavedToastVisible(true);
      // Defensive: clear any still-pending timer from an earlier save
      // before scheduling a new one, so at most one onGoHome?.() can ever
      // be pending at a time even if this guard were somehow bypassed.
      if (goHomeTimeoutRef.current) clearTimeout(goHomeTimeoutRef.current);
      goHomeTimeoutRef.current = setTimeout(() => {
        setSavedToastVisible(false);
        onGoHome?.();
      }, SAVED_TOAST_DURATION_MS);
    } finally {
      saveInFlightRef.current = false;
    }
  }

  const insetStyle = {
    paddingLeft: spacing.md + insets.left,
    paddingRight: spacing.md + insets.right,
    paddingBottom: spacing.md + insets.bottom,
  };

  if (!profile) {
    return (
      <View testID="settings-loading" style={[styles.scrollView, styles.screen, insetStyle]} />
    );
  }

  const displayedFolderUri = pendingFolderUri ?? profile.rootFolderUri;

  return (
    <PaperProvider theme={parentPaperTheme}>
      <>
        <ScrollView
          testID="settings-loaded"
          style={styles.scrollView}
          contentContainerStyle={[styles.screen, insetStyle]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{t('settingsTitle')}</Text>

          <View style={styles.row}>
            <View style={[styles.card, styles.halfCard]}>
              <Text style={styles.label}>{t('onboardingName')}</Text>
              <TextInput
                testID="settings-name-input"
                value={profile.name}
                onChangeText={(name) => setProfile({ ...profile, name })}
                style={styles.textInput}
              />
            </View>

            <View style={[styles.card, styles.halfCard]}>
              <Text style={styles.label}>{t('onboardingAge')}</Text>
              <AgePicker
                value={age}
                onChange={setAge}
                visible={ageModalVisible}
                onOpen={() => setAgeModalVisible(true)}
                onClose={() => setAgeModalVisible(false)}
                placeholder={t('onboardingSelectAge')}
                testIDPrefix="settings-age"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.card, styles.halfCard]}>
              <Text style={styles.label}>{t('onboardingLanguage')}</Text>
              <LanguageSelector
                value={profile.language}
                onChange={(next) => setProfile({ ...profile, language: next })}
                visible={languageModalVisible}
                onOpen={() => setLanguageModalVisible(true)}
                onClose={() => setLanguageModalVisible(false)}
                testIDPrefix="settings-lang"
                variant="parent"
              />
            </View>

            <View style={[styles.card, styles.halfCard]}>
              <Text style={styles.label}>{t('settingsFolder')}</Text>
              {displayedFolderUri && (
                <View style={styles.folderStatus}>
                  <Text style={styles.folderStatusMark}>{'✓'}</Text>
                  <Text testID="settings-folder-path" style={styles.folderStatusText} numberOfLines={1}>
                    {toReadableFolderPath(displayedFolderUri)}
                  </Text>
                </View>
              )}
              <Pressable
                testID="settings-folder-picker"
                onPress={handlePickFolder}
                style={({ pressed }) => [styles.folderButton, pressed && styles.pressedSubtle]}
                hitSlop={{ top: 8, bottom: 8 }}
              >
                <Text style={styles.folderButtonText}>{t('settingsChangeFolder')}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{t('settingsProfilePicture')}</Text>
            <View style={styles.pictureRow}>
              {profile.pictureUri && !previewFailed ? (
                <Image
                  testID="settings-picture-preview"
                  source={{ uri: profile.pictureUri }}
                  style={styles.picturePreview}
                  accessibilityLabel={t('settingsProfilePicture')}
                  onError={() => setPreviewFailed(true)}
                />
              ) : (
                <View testID="settings-picture-placeholder" style={styles.picturePlaceholder} />
              )}

              <View style={styles.pictureButtons}>
                {picturesFolderUri && (
                  <Pressable
                    testID="settings-picture-choose"
                    onPress={handleChoosePicture}
                    style={({ pressed }) => [styles.choosePictureButton, pressed && styles.pressedSubtle]}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <Text style={styles.choosePictureButtonText}>{t('profilePictureChoose')}</Text>
                  </Pressable>
                )}
                {profile.pictureUri && (
                  <Pressable
                    testID="settings-picture-remove"
                    onPress={handleRemovePicture}
                    style={({ pressed }) => [styles.removePictureButton, pressed && styles.pressedSubtle]}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <Text style={styles.removePictureButtonText}>{t('profilePictureRemove')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>

          {migrating && (
            <FadeInBanner style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>{t('migrationInProgress')}</Text>
            </FadeInBanner>
          )}
          {migrationError && (
            <FadeInBanner style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{migrationError}</Text>
            </FadeInBanner>
          )}
          {savedToastVisible && (
            <FadeInBanner testID="settings-saved-toast" style={styles.successBanner}>
              <Text style={styles.successBannerText}>{t('settingsSavedToast')}</Text>
            </FadeInBanner>
          )}

          <Pressable
            testID="settings-save"
            onPress={handleSave}
            disabled={migrating}
            style={({ pressed }) => [
              styles.saveButton,
              migrating ? styles.saveButtonDisabled : styles.saveButtonEnabled,
              pressed && !migrating && styles.pressedSubtle,
            ]}
          >
            <Text style={[styles.saveButtonText, migrating ? styles.saveButtonTextDisabled : styles.saveButtonTextEnabled]}>
              {t('settingsSave')}
            </Text>
          </Pressable>

          <Pressable
            testID="settings-reset"
            onPress={handleReset}
            disabled={resetting}
            style={({ pressed }) => [
              styles.resetButton,
              resetting && styles.resetButtonDisabled,
              pressed && !resetting && styles.pressedSubtle,
            ]}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Text style={styles.resetButtonText}>{t('settingsReset')}</Text>
          </Pressable>
        </ScrollView>

        {picturesFolderUri && (
          <ProfilePicturePicker
            visible={pickerVisible}
            picturesFolderUri={picturesFolderUri}
            onSelect={handlePictureSelected}
            onClose={() => setPickerVisible(false)}
          />
        )}
      </>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.parent.background,
  },
  screen: {
    flexGrow: 1,
    padding: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.parent.ink,
    textAlign: 'center',
    marginTop: spacing.xxs,
    marginBottom: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  halfCard: {
    flex: 1,
    marginBottom: 0,
  },
  card: {
    backgroundColor: colors.parent.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.parent.border,
    padding: spacing.xs,
    marginBottom: spacing.xs,
    ...elevation.level1,
  },
  label: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.parent.inkMuted,
    marginBottom: spacing.xxs,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.parent.border,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
    color: colors.parent.ink,
    backgroundColor: colors.parent.background,
  },
  folderStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginBottom: spacing.xs,
    backgroundColor: colors.parent.accentSoft,
    borderRadius: radii.md,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xs,
    alignSelf: 'stretch',
  },
  folderStatusMark: {
    color: colors.parent.accentDark,
    fontWeight: '800',
    fontSize: 14,
  },
  folderStatusText: {
    flex: 1,
    color: colors.parent.accentDark,
    fontWeight: '700',
    fontSize: 14,
  },
  folderButton: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.parent.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  folderButtonText: {
    color: colors.parent.accent,
    fontSize: typography.bodySmall.fontSize,
    fontWeight: '700',
  },
  pictureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  picturePreview: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.disabledBg,
    borderWidth: 1,
    borderColor: colors.parent.border,
  },
  picturePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.parent.accentSoft,
    borderWidth: 1,
    borderColor: colors.parent.border,
  },
  pictureButtons: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  choosePictureButton: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.parent.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  choosePictureButtonText: {
    color: colors.white,
    fontSize: typography.bodySmall.fontSize,
    fontWeight: '700',
  },
  // Deliberately styled as this screen's clearest "destructive action" —
  // per the redesign brief, permission/migration-adjacent actions (removing
  // the only picture on file) get the shared design-system `berry` error hue
  // rather than a soft neutral outline, so it visually stands apart from
  // ordinary secondary actions like "Change content folder".
  removePictureButton: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.berrySoft,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.berry,
  },
  removePictureButtonText: {
    color: colors.berryDark,
    fontSize: typography.bodySmall.fontSize,
    fontWeight: '700',
  },
  infoBanner: {
    backgroundColor: colors.parent.accentSoft,
    borderRadius: radii.md,
    padding: spacing.xs,
    marginBottom: spacing.xs,
  },
  infoBannerText: {
    color: colors.parent.accentDark,
    fontWeight: '700',
    textAlign: 'center',
  },
  // The migration-failure banner is this screen's other clear
  // "destructive/needs-attention" surface (content may be stuck on the OLD
  // folder) — same berry hue family as removePictureButton, at full
  // strength since it's reporting an actual failure rather than offering an
  // action.
  errorBanner: {
    backgroundColor: colors.berry,
    borderRadius: radii.md,
    padding: spacing.xs,
    marginBottom: spacing.xs,
  },
  errorBannerText: {
    color: colors.white,
    fontWeight: '700',
    textAlign: 'center',
  },
  // A calm, positive confirmation — this screen's `jade`/success-adjacent
  // family rather than the `parent.accent` used for informational banners,
  // so "it worked" reads distinctly from "here's a status update".
  successBanner: {
    backgroundColor: colors.jade,
    borderRadius: radii.md,
    padding: spacing.xs,
    marginBottom: spacing.xs,
  },
  successBannerText: {
    color: colors.white,
    fontWeight: '700',
    textAlign: 'center',
  },
  saveButton: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    marginTop: spacing.xxs,
    borderWidth: 1,
  },
  saveButtonEnabled: {
    backgroundColor: colors.parent.accent,
    borderColor: colors.parent.accentDark,
    ...elevation.level2,
  },
  saveButtonDisabled: {
    backgroundColor: colors.disabledBg,
    borderColor: colors.disabledBorder,
  },
  saveButtonText: {
    fontSize: typography.body.fontSize,
    fontWeight: '800',
  },
  saveButtonTextEnabled: {
    color: colors.white,
  },
  saveButtonTextDisabled: {
    color: colors.disabledText,
  },
  // Deliberately a plain outlined "danger" link-style control, not a filled
  // button — it sits below Save and must never visually compete with it as
  // the screen's primary action, while still reading unmistakably as
  // destructive via the same berry error hue used by removePictureButton
  // above.
  resetButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.berry,
    backgroundColor: 'transparent',
  },
  resetButtonDisabled: {
    opacity: 0.5,
  },
  resetButtonText: {
    color: colors.berryDark,
    fontSize: typography.bodySmall.fontSize,
    fontWeight: '700',
  },
  // Shared "pressed" feedback for this screen's plain Pressables: a subtle
  // opacity dip applied instantly via Pressable's own `pressed` render prop
  // (no Animated driver, no spring/bounce) — deliberately calmer than the
  // design-system's tilt/lift press feedback used on child-facing screens,
  // per this redesign's brief that Settings needs quick, unfussy controls.
  pressedSubtle: {
    opacity: 0.75,
  },
});
