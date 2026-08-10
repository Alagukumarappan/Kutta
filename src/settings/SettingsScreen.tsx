import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, ScrollView, Image, Animated } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperProvider, TextInput } from 'react-native-paper';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { getProfile, saveProfile, clearProfile } from '../storage/profileStore';
import { getActivityLog, clearActivityLog, type ActivityLog } from '../storage/activityLog';
import { clearAllFileReferences } from '../storage/fileReferenceStore';
import { clearLineArtCache } from '../coloring/lineArtCache';
import { clearPuzzleDifficulty } from '../storage/puzzleDifficultyStore';
import { clearMusicSettings } from '../storage/musicSettingsStore';
import { MusicSettingsSection } from './MusicSettingsSection';
import { requestFolderAccess, findChildUri, KUTTA_GAMES_FOLDER_NAME } from '../storage/folderAccess';
import { migrateContent } from '../storage/folderMigration';
import { toReadableFolderPath } from '../storage/folderPathDisplay';
import { AgePicker } from '../components/AgePicker';
import { LanguageSelector } from '../components/LanguageSelector';
import { ProfilePicturePicker } from './ProfilePicturePicker';
import type { Profile } from '../types/profile';
import {
  colors,
  radii,
  spacing,
  elevation,
  typography,
  motion,
  parentPaperTheme,
  GradientScreenBackground,
} from '../design-system';

// This screen keeps Kutta's CALMER "parent" register for its cards, inputs,
// and controls (see `colors.parent`/`parentPaperTheme` in
// `src/design-system/`) rather than the playful bubblegum/violet/jade
// child-facing palette — a parent scanning this screen quickly to fix a name
// typo or swap the content folder shouldn't be fighting toy colors or bouncy
// tilt animations to do it. A local <PaperProvider> wraps just this screen's
// subtree (per paperTheme.ts's own guidance) so it never needs App.tsx's
// top-level PaperProvider to change, and every other screen keeps the
// playful theme untouched.
//
// The one thing that DID change (full-consistency re-theme): the flat
// `colors.parent.background` root fill is now the same shared
// `GradientScreenBackground` (sky/skyDark) every other screen uses, per an
// explicit ask to make the background consistent everywhere — Settings was
// previously the one deliberate exception. Every card below is still an
// OPAQUE `colors.parent.surface` (white) box, so this swap doesn't touch any
// text/input contrast inside them; only two things sit directly on the new
// gradient rather than inside a card — the title (large, bold, still clears
// 3:1) and the Reset button, which needed its background changed from
// `'transparent'` to `colors.berrySoft` (see resetButton below) since its
// berry border/text were designed against a flat near-white backdrop and
// nearly vanish directly on the saturated sky gradient.
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

// Same length-cap idiom as TicTacToeSetupScreen's friend-name field and
// OnboardingScreen's own name field (quality-evolution iterations 18/20):
// this name is later rendered centered and unbounded on TicTacToeScreen's
// statusText and the shared CelebrationOverlay's completion title, neither
// of which truncates or scrolls — an arbitrarily long name could push
// those layouts off-screen.
const CHILD_NAME_MAX_LENGTH = 20;

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
  const { t, language, setLanguage } = useLanguage();
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
  const [activityLog, setActivityLog] = useState<ActivityLog | null>(null);
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
  // Same re-entrancy guard idiom as OnboardingScreen's pickingFolderRef and
  // FolderErrorScreen's pickingRef (both reuse this exact
  // requestFolderAccess() primitive) — without it, a rapid double-tap on
  // "Change content folder" could fire two concurrent SAF picker
  // invocations, whose two resolved uris could resolve out of order and
  // leave pendingFolderUri set to whichever one happened to finish first
  // rather than the one the parent actually meant to end up with.
  const pickingFolderRef = useRef(false);
  // `resetting` is state, so it only starts blocking handleReset on the NEXT
  // render — and it isn't even set until the confirmation has been accepted.
  // Two taps on "Reset everything" landing in one touch batch (a child
  // drumming on the screen, an impatient double-tap) therefore both got
  // through and queued TWO confirmation dialogs. Confirming the first one
  // wipes the profile and unmounts this screen, leaving the second
  // "Reset everything?" dialog sitting on top of the freshly-shown
  // Onboarding screen — and its Reset button still runs performReset against
  // this unmounted screen's closures. This ref is checked-and-set
  // synchronously, so only one dialog can ever be open; it is released again
  // if the parent cancels or dismisses it, so Reset stays usable.
  const resetConfirmOpenRef = useRef(false);
  // Second line of defence, guarding the wipe itself the same way
  // saveInFlightRef guards handleSave — a re-entrant performReset would run
  // two concurrent clears (and two onReset callbacks) against the same
  // storage.
  const resetInFlightRef = useRef(false);
  // handleSave awaits confirmMigration()/migrateContent() before persisting
  // — both potentially slow (a real confirmation dialog, a real file copy)
  // — but nothing disables the name/age/language/picture fields while that
  // await is pending. Without these refs, handleSave would build its
  // "nextProfile" to save from a SNAPSHOT of `profile`/`age` taken before
  // those awaits, so any edit the parent makes to those fields WHILE a
  // migration is in flight would be silently discarded the moment the
  // in-flight save's own `setProfile(nextProfile)` finally runs, overwriting
  // the parent's newer edit with the stale one. Kept in sync on every
  // render below so handleSave can read the FRESHEST values right before
  // actually persisting, instead of the ones captured when Save was first
  // pressed. Deliberately NOT applied to the folder-migration decision
  // itself (`pendingFolderUri`) — which folder migrateContent actually
  // migrates FROM/TO must stay pinned to the snapshot taken when Save was
  // pressed, not silently redirected if the parent picks yet another folder
  // mid-migration.
  const latestProfileRef = useRef(profile);
  const latestAgeRef = useRef(age);

  useEffect(() => {
    latestProfileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    latestAgeRef.current = age;
  }, [age]);

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
    getActivityLog().then(setActivityLog);
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
    if (pickingFolderRef.current) return;
    pickingFolderRef.current = true;
    try {
      const uri = await requestFolderAccess();
      setPendingFolderUri(uri);
    } catch (err) {
      // Translated, parent-readable message instead of the raw English
      // exception text — same reasoning as OnboardingScreen's own copy of
      // this handler.
      console.warn('Folder picker failed', err);
      Alert.alert(t('folderPickError'));
    } finally {
      pickingFolderRef.current = false;
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
    if (!profile || resetting || resetConfirmOpenRef.current) return;
    resetConfirmOpenRef.current = true;
    Alert.alert(
      t('settingsResetConfirmTitle'),
      t('settingsResetConfirmBody'),
      [
        {
          text: t('cancel'),
          style: 'cancel',
          onPress: () => {
            resetConfirmOpenRef.current = false;
          },
        },
        { text: t('settingsReset'), style: 'destructive', onPress: performReset },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          resetConfirmOpenRef.current = false;
        },
      }
    );
  }

  async function performReset() {
    resetConfirmOpenRef.current = false;
    if (resetInFlightRef.current) return;
    resetInFlightRef.current = true;
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
      await clearActivityLog();
      // Individually-"+"-added file references and the remembered puzzle
      // difficulty are both keyed globally (not per-profile), so without
      // these a fresh profile after this reset would silently inherit the
      // PREVIOUS child's picked files and difficulty setting instead of a
      // genuine fresh start.
      await clearAllFileReferences();
      await clearLineArtCache();
      await clearMusicSettings();
      await clearPuzzleDifficulty();
      onReset?.();
    } finally {
      resetInFlightRef.current = false;
      setResetting(false);
    }
  }

  async function handleSave() {
    if (!profile || migrating || saveInFlightRef.current) return;
    // Unlike OnboardingScreen (which disables Save entirely until the name
    // is non-blank), this screen has no existing convention for disabling
    // Save based on field validity — every other failure here (folder pick,
    // migration) already surfaces via Alert.alert, so a blank/whitespace-only
    // name is blocked the same way rather than introducing a new inline
    // field-error style just for this one case. Without this, a parent
    // clearing the name field and hitting Save would silently persist an
    // empty name, breaking HomeScreen's "Hi, {name}" greeting and the
    // profile-picture initial-letter fallback (both assume a non-empty name).
    if (profile.name.trim().length === 0) {
      Alert.alert(t('onboardingNameMissing'));
      return;
    }
    saveInFlightRef.current = true;
    try {
      setMigrationError(null);

      // Which folder to migrate FROM/TO is decided from the snapshot taken
      // when Save was pressed, deliberately NOT re-read from the latest
      // state below — if the parent somehow picked yet another folder while
      // this migration is already in flight, that later pick must not
      // retroactively change what's already being migrated.
      let migratedRootFolderUri: string | undefined;

      if (pendingFolderUri && pendingFolderUri !== profile.rootFolderUri) {
        const oldUri = profile.rootFolderUri;
        const confirmed = oldUri ? await confirmMigration() : true;

        if (!confirmed) {
          // Declining the MOVE declines only the folder change — this used
          // to `return` out of the whole save, which silently threw away
          // every other edit the parent had staged (name, age, language,
          // picture) with no feedback whatsoever, while the folder card kept
          // showing the newly-picked folder with a green tick as though the
          // change had gone through. Clearing the pending pick puts that
          // card back in sync with reality, and the rest of the save
          // continues below against the UNCHANGED root folder.
          setPendingFolderUri(null);
        } else {
          setMigrating(true);
          const result = oldUri
            ? await migrateContent(oldUri, pendingFolderUri)
            : ({ success: true } as const);
          setMigrating(false);

          if (!result.success) {
            // Deliberately NOT the same "save the rest anyway" treatment as
            // the cancel path above: a failed migration has to leave the
            // parent looking at the error banner with the pending folder
            // still staged so they can retry, and finishing the save here
            // would start the 1.2s toast timer that navigates away from that
            // banner before it can even be read.
            setMigrationError(t('migrationFailed'));
            return;
          }
          migratedRootFolderUri = pendingFolderUri;
        }
      }

      // Read the FRESHEST name/age/language/picture right before
      // persisting, not the snapshot from when Save was first pressed —
      // see latestProfileRef/latestAgeRef's own comment above for why.
      const latestProfile = latestProfileRef.current;
      const latestAge = latestAgeRef.current;
      if (!latestProfile) return;

      // If the name went blank during the migration confirm/copy above,
      // fall back to the ORIGINAL, already-validated name instead of
      // blocking persistence entirely. By this point a folder migration may
      // already have irreversibly happened — migrateContent deletes the old
      // folder's content once its copy is verified — so aborting the save
      // here (as an earlier version of this fix did) would leave the
      // profile pointing at now-deleted content with no way back. The
      // freshest name is still used whenever it's actually valid; only the
      // specific "went blank mid-flight" case silently falls back, and only
      // for the name field — every other fresh edit (age/language/picture)
      // is still honored below.
      const freshName = latestProfile.name.trim();
      const nameToSave = freshName.length > 0 ? freshName : profile.name.trim();

      const nextProfile: Profile = {
        ...latestProfile,
        name: nameToSave,
        age: latestAge !== null ? latestAge : latestProfile.age,
        rootFolderUri: migratedRootFolderUri ?? latestProfile.rootFolderUri,
      };

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
      <GradientScreenBackground testID="settings-loading" style={insetStyle} />
    );
  }

  const displayedFolderUri = pendingFolderUri ?? profile.rootFolderUri;

  return (
    <PaperProvider theme={parentPaperTheme}>
      <GradientScreenBackground>
        <ScrollView
          testID="settings-loaded"
          style={styles.scrollView}
          contentContainerStyle={[styles.screen, insetStyle]}
          /* Without this, the first tap on "Save changes" while the name
             keyboard is still up only dismisses the keyboard — the parent
             has to tap Save twice, and the first tap reads as ignored. */
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{t('settingsTitle')}</Text>

          {activityLog && (activityLog.quizzesCompleted > 0 || activityLog.puzzlesCompleted > 0) && (
            <View testID="settings-accomplishments" style={styles.card}>
              <Text style={styles.label}>{t('settingsAccomplishmentsTitle')}</Text>
              <Text style={styles.accomplishmentsText}>
                {tFormat(
                  activityLog.quizzesCompleted === 1 ? 'settingsQuizzesCompletedOne' : 'settingsQuizzesCompleted',
                  language,
                  { count: activityLog.quizzesCompleted }
                )}
                {'  •  '}
                {tFormat(
                  activityLog.puzzlesCompleted === 1 ? 'settingsPuzzlesCompletedOne' : 'settingsPuzzlesCompleted',
                  language,
                  { count: activityLog.puzzlesCompleted }
                )}
              </Text>
            </View>
          )}

          <View style={styles.row}>
            <View style={[styles.card, styles.halfCard]}>
              {/* Unlike OnboardingScreen's equivalent name field (whose
                  external label heads a row containing an avatar picker
                  too), this card's label describes ONLY this TextInput —
                  so it's replaced outright by Paper's own built-in
                  floating label instead of keeping both, per this
                  migration's "reduce to one cleaner element" guidance. */}
              <TextInput
                mode="outlined"
                dense
                label={t('onboardingName')}
                testID="settings-name-input"
                value={profile.name}
                onChangeText={(name) => setProfile({ ...profile, name: name.slice(0, CHILD_NAME_MAX_LENGTH) })}
                maxLength={CHILD_NAME_MAX_LENGTH}
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
                accessibilityRole="button"
                accessibilityLabel={t('settingsChangeFolder')}
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
                    accessibilityRole="button"
                    accessibilityLabel={t('profilePictureChoose')}
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
                    accessibilityRole="button"
                    accessibilityLabel={t('profilePictureRemove')}
                    style={({ pressed }) => [styles.removePictureButton, pressed && styles.pressedSubtle]}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <Text style={styles.removePictureButtonText}>{t('profilePictureRemove')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>

          <MusicSettingsSection />

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
            accessibilityRole="button"
            accessibilityLabel={t('settingsSave')}
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
            accessibilityRole="button"
            accessibilityLabel={t('settingsReset')}
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
      </GradientScreenBackground>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    // Background now comes from the shared GradientScreenBackground this
    // screen renders into (see the component above) rather than a flat fill
    // here.
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
  accomplishmentsText: {
    fontSize: typography.body.fontSize,
    fontWeight: '600',
    color: colors.parent.ink,
  },
  textInput: {
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
  // above. Unlike removePictureButton, this one sits directly on the
  // screen's root background rather than inside a white card — now that
  // root is the saturated sky gradient (not the old flat near-white
  // `colors.parent.background`), a literal `'transparent'` fill let the
  // berry border/text blend almost invisibly into it (as low as ~1:1-1.4:1
  // contrast). `colors.berrySoft` gives it the same light, opaque backing
  // removePictureButton already uses, so the berry border/text read exactly
  // as before regardless of what's behind it.
  resetButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.berry,
    backgroundColor: colors.berrySoft,
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
