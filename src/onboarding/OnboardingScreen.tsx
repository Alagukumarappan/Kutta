import React, { useRef, useState } from 'react';
import { View, Text, Image, Alert, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { PaperProvider, TextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { requestFolderAccess, ensureContentStructure } from '../storage/folderAccess';
import { saveProfile } from '../storage/profileStore';
import { toReadableFolderPath } from '../storage/folderPathDisplay';
import { AgePicker } from '../components/AgePicker';
import { LanguageSelector } from '../components/LanguageSelector';
import { ProfilePicturePicker } from '../settings/ProfilePicturePicker';
import { MusicSettingsSection } from '../settings/MusicSettingsSection';
import {
  colors,
  radii,
  spacing,
  elevation,
  typography,
  parentPaperTheme,
  withAlpha,
  GradientScreenBackground,
} from '../design-system';

// Full visual match with SettingsScreen (per an explicit design decision,
// not just matching field order): same PaperProvider/parentPaperTheme, same
// plain card/label/button styling, same field grouping (Name+Age row,
// Language+Folder row, a full-width Profile Picture card, then Save) —
// Onboarding no longer carries its own separate playful RaisedCard/
// AnimatedPressable presentation. All BEHAVIOR (validation, folder-picker
// invocation, language switching, the save flow, error alerts) is
// unchanged from the previous version — only the presentation and field
// grouping moved. The inline avatar-in-the-name-row is gone entirely — the
// profile picture is now its own full-width card, exactly like Settings'.
const CHILD_NAME_MAX_LENGTH = 20;

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { t, language, setLanguage } = useLanguage();
  // Rendered directly (not inside a Stack.Screen), so there's no native
  // header ever — this screen has to reserve its own safe-area insets
  // (including insets.top, unlike Settings' headerShown:true screen) so a
  // side notch or gesture-nav bar never covers content.
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [age, setAge] = useState<number | null>(null);
  const [ageModalVisible, setAgeModalVisible] = useState(false);
  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Optional profile picture — same field Settings lets a parent change
  // later (Profile.pictureUri), just settable here too so Home's greeting
  // can show it from the very first launch. No picturesFolderUri is passed
  // to the picker below (see that component's own doc comment): the
  // "pictures" folder doesn't exist as a real listable directory until
  // ensureContentStructure runs in handleSave, below — so onboarding can
  // only offer "Browse anywhere", not a folder grid.
  const [pictureUri, setPictureUri] = useState<string | undefined>(undefined);
  const [pictureModalVisible, setPictureModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  // Same stale-preview guard as SettingsScreen's own previewFailed — a
  // failure recorded against an OLD uri must never keep hiding a preview
  // for a newly-picked one.
  const [previewFailed, setPreviewFailed] = useState(false);

  function handleNameChange(text: string) {
    setName(text.slice(0, CHILD_NAME_MAX_LENGTH));
  }

  const nameValid = name.trim().length > 0;
  const ageValid = age !== null;
  const folderValid = !!folderUri;
  const isValid = nameValid && ageValid && folderValid;
  const saveDisabled = !isValid || saving;
  // Same re-entrancy guard idiom as SettingsScreen's saveInFlightRef
  // (iteration 6): `saveDisabled`/`saving` only take effect on the NEXT
  // render, so a rapid double-tap on Save — trivial for a child, and this
  // is the very first screen anyone interacts with — could re-enter
  // handleSave while the first call is still awaiting
  // ensureContentStructure/saveProfile, risking two concurrent sample-
  // content copies and onComplete() firing twice. A ref closes that gap
  // immediately, synchronously, unlike state.
  const savingRef = useRef(false);
  // Same re-entrancy guard idiom as savingRef above (and FolderErrorScreen's
  // pickingRef in RootNavigator.tsx, which reuses this exact
  // requestFolderAccess() primitive) — without it, a rapid double-tap on
  // "Choose content folder" could fire two concurrent SAF picker
  // invocations, whose two resolved uris could resolve out of order and
  // leave folderUri set to whichever one happened to finish first rather
  // than the one the parent actually meant to end up with.
  const pickingFolderRef = useRef(false);

  async function handlePickFolder() {
    if (pickingFolderRef.current) return;
    pickingFolderRef.current = true;
    try {
      const uri = await requestFolderAccess();
      setFolderUri(uri);
    } catch (err) {
      // Never surface the raw exception: it is an English-only, technical
      // SAF/Java message a German-speaking parent can neither read nor act
      // on. `folderPickError` is the translated equivalent (it existed in
      // strings.ts for exactly this and was simply never wired up).
      console.warn('Folder picker failed', err);
      Alert.alert(t('folderPickError'));
    } finally {
      pickingFolderRef.current = false;
    }
  }

  async function handleSave() {
    if (!isValid || !folderUri || age === null || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await ensureContentStructure(folderUri);
      await saveProfile({ name: name.trim(), age, language, rootFolderUri: folderUri, pictureUri });
      onComplete();
    } catch (err) {
      console.warn('Onboarding save failed', err);
      Alert.alert(t('onboardingSaveError'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <PaperProvider theme={parentPaperTheme}>
      <GradientScreenBackground style={styles.outer}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.screen,
            {
              paddingTop: spacing.sm + insets.top,
              paddingLeft: spacing.sm + insets.left,
              paddingRight: spacing.sm + insets.right,
              paddingBottom: spacing.sm + insets.bottom,
            },
          ]}
          /* Without this, the first tap on Save (or on the age/language/folder
             controls) while the name keyboard is still up is swallowed purely to
             dismiss the keyboard, so a parent has to tap twice and the first tap
             looks like the app ignored them. */
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{t('onboardingTitle')}</Text>
          <Text style={styles.subtitle}>{t('onboardingSubtitle')}</Text>

          <View style={styles.row}>
            <View style={[styles.card, styles.halfCard]}>
              <TextInput
                mode="outlined"
                dense
                label={t('onboardingName')}
                testID="onboarding-name-input"
                value={name}
                onChangeText={handleNameChange}
                maxLength={CHILD_NAME_MAX_LENGTH}
                style={styles.textInput}
              />
              {!nameValid && (
                <Text testID="onboarding-name-error" style={styles.fieldError}>
                  ⚠ {t('onboardingNameMissing')}
                </Text>
              )}
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
                testIDPrefix="onboarding-age"
              />
              {!ageValid && (
                <Text testID="onboarding-age-error" style={styles.fieldError}>
                  ⚠ {t('onboardingAgeMissing')}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.card, styles.halfCard]}>
              <Text style={styles.label}>{t('onboardingLanguage')}</Text>
              <LanguageSelector
                value={language}
                onChange={(next) => setLanguage(next)}
                visible={languageModalVisible}
                onOpen={() => setLanguageModalVisible(true)}
                onClose={() => setLanguageModalVisible(false)}
                testIDPrefix="onboarding-lang"
                variant="parent"
              />
            </View>

            <View style={[styles.card, styles.halfCard]}>
              <Text style={styles.label}>{t('settingsFolder')}</Text>
              {folderUri && (
                <View style={styles.folderStatus}>
                  <Text style={styles.folderStatusMark}>{'✓'}</Text>
                  <Text testID="onboarding-folder-picked" style={styles.folderStatusText} numberOfLines={1}>
                    {toReadableFolderPath(folderUri)}
                  </Text>
                </View>
              )}
              <Pressable
                testID="onboarding-folder-picker"
                onPress={handlePickFolder}
                accessibilityRole="button"
                accessibilityLabel={t('onboardingPickFolder')}
                style={({ pressed }) => [styles.folderButton, pressed && styles.pressedSubtle]}
                hitSlop={{ top: 8, bottom: 8 }}
              >
                <Text style={styles.folderButtonText}>{t('onboardingPickFolder')}</Text>
              </Pressable>
              {!folderValid && (
                <Text testID="onboarding-folder-error" style={styles.fieldError}>
                  ⚠ {t('onboardingFolderMissing')}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{t('settingsProfilePicture')}</Text>
            <View style={styles.pictureRow}>
              {pictureUri && !previewFailed ? (
                <Image
                  testID="onboarding-picture-preview"
                  source={{ uri: pictureUri }}
                  style={styles.picturePreview}
                  accessibilityLabel={t('settingsProfilePicture')}
                  onError={() => setPreviewFailed(true)}
                />
              ) : (
                <View testID="onboarding-picture-placeholder" style={styles.picturePlaceholder}>
                  <Text style={styles.picturePlaceholderText}>{(name.trim().charAt(0) || '?').toUpperCase()}</Text>
                </View>
              )}

              <View style={styles.pictureButtons}>
                <Pressable
                  testID="onboarding-picture-picker"
                  onPress={() => {
                    setPreviewFailed(false);
                    setPictureModalVisible(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('profilePictureChoose')}
                  style={({ pressed }) => [styles.choosePictureButton, pressed && styles.pressedSubtle]}
                  hitSlop={{ top: 6, bottom: 6 }}
                >
                  <Text style={styles.choosePictureButtonText}>{t('profilePictureChoose')}</Text>
                </Pressable>
                {pictureUri && (
                  <Pressable
                    testID="onboarding-picture-remove"
                    onPress={() => setPictureUri(undefined)}
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

          <Pressable
            testID="onboarding-save-button"
            onPress={handleSave}
            disabled={saveDisabled}
            accessibilityRole="button"
            accessibilityLabel={t('onboardingSave')}
            style={({ pressed }) => [
              styles.saveButton,
              saveDisabled ? styles.saveButtonDisabled : styles.saveButtonEnabled,
              pressed && !saveDisabled && styles.pressedSubtle,
            ]}
          >
            <Text
              style={[styles.saveButtonText, saveDisabled ? styles.saveButtonTextDisabled : styles.saveButtonTextEnabled]}
            >
              {t('onboardingSave')}
            </Text>
          </Pressable>

          <ProfilePicturePicker
            visible={pictureModalVisible}
            onSelect={(uri) => {
              setPictureUri(uri);
              setPictureModalVisible(false);
            }}
            onClose={() => setPictureModalVisible(false)}
          />
        </ScrollView>

        {saving && (
          // First save ever can take a few real seconds (creating the
          // Kutta-games folder structure and copying in the bundled sample
          // content, see folderAccess.ts's ensureContentStructure) — without
          // this, the screen just sits there with a disabled button and no
          // explanation, which reads as broken/frozen rather than working.
          <View testID="onboarding-saving-overlay" style={styles.savingOverlay}>
            <ActivityIndicator size="large" color={colors.white} />
            <Text style={styles.savingText}>{t('onboardingSavingMessage')}</Text>
          </View>
        )}
      </GradientScreenBackground>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  savingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: withAlpha(colors.ink, 0.72),
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  savingText: {
    marginTop: spacing.md,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
  },
  screen: {
    flexGrow: 1,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.parent.ink,
    textAlign: 'center',
    marginTop: spacing.xxs,
    marginBottom: spacing.xxs,
  },
  subtitle: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
    color: colors.parent.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  picturePlaceholderText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.parent.accentDark,
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
  fieldError: {
    marginTop: spacing.xxs,
    color: colors.berryDark,
    fontSize: 13,
    fontWeight: '700',
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
  pressedSubtle: {
    opacity: 0.75,
  },
});
