import React, { useRef, useState } from 'react';
import { View, Text, Image, Alert, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { requestFolderAccess, ensureContentStructure } from '../storage/folderAccess';
import { saveProfile } from '../storage/profileStore';
import { toReadableFolderPath } from '../storage/folderPathDisplay';
import { AgePicker } from '../components/AgePicker';
import { LanguageSelector } from '../components/LanguageSelector';
import { ProfilePicturePicker } from '../settings/ProfilePicturePicker';
import {
  colors,
  radii,
  spacing,
  typography,
  RaisedCard,
  RaisedPrimaryButton,
  AnimatedPressable,
  withAlpha,
  GradientScreenBackground,
} from '../design-system';

// This first-launch screen is where a parent sets a child's profile up —
// redesigned onto the new design-system (RaisedCard/RaisedPrimaryButton/
// AnimatedPressable) per REDESIGN_PROGRESS.md's iteration for Onboarding.
// All behavior (validation, folder picker invocation, language switching,
// save flow, error alerts) is unchanged from the original screen — only the
// visual presentation moved from flat bordered boxes to layered, "lifted
// paper" cards with the new candy/aurora palette.
//
// The language pills and the folder-picker button deliberately stay as
// AnimatedPressable (not the Paper-backed RaisedPrimaryButton/
// RaisedSecondaryButton) rather than converting every control to a Paper
// button: AnimatedPressable exposes a raw `hitSlop` prop, which these two
// controls need to comfortably clear the 48dp touch-target guideline given
// their compact chip sizing, matching the touch-target-audit precedent
// already established for these two controls (and SettingsScreen's
// identically-styled pair). The Save button, this screen's single biggest
// and most consequential action, uses the full RaisedPrimaryButton instead —
// its size='large' preset already clears touchTarget.primaryCTA (64dp) on
// its own, no hitSlop trick required.
// Same length-cap idiom as TicTacToeSetupScreen's friend-name field
// (quality-evolution iteration 18): this name is later rendered centered
// and unbounded on TicTacToeScreen's statusText and the shared
// CelebrationOverlay's completion title, neither of which truncates or
// scrolls — an arbitrarily long name could push those layouts off-screen.
const CHILD_NAME_MAX_LENGTH = 20;

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { t, language, setLanguage } = useLanguage();
  // Rendered directly (not inside a Stack.Screen), so there's no native
  // header ever — this screen has to reserve its own safe-area insets, same
  // as every other landscape screen (Home, Settings), so a side notch or
  // gesture-nav bar never covers content.
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
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
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
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
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
      <Text style={styles.brandBadge}>🐾</Text>
      <Text style={styles.title}>{t('onboardingTitle')}</Text>
      <Text style={styles.subtitle}>{t('onboardingSubtitle')}</Text>

      <View style={styles.row}>
        <RaisedCard color={colors.surface} borderColor={colors.line} style={styles.halfCard} elevationLevel="level2">
          <View style={styles.cardContent}>
            <Text style={styles.label}>{t('onboardingName')}</Text>
            <View style={styles.nameRow}>
              <AnimatedPressable
                testID="onboarding-picture-picker"
                onPress={() => setPictureModalVisible(true)}
                tilt="compact"
                style={styles.avatarOuter}
                innerStyle={styles.avatarButton}
                accessibilityLabel={t('profilePictureChoose')}
              >
                {pictureUri ? (
                  <Image
                    testID="onboarding-picture-preview"
                    source={{ uri: pictureUri }}
                    style={styles.avatarImage}
                    onError={() => setPictureUri(undefined)}
                  />
                ) : (
                  <Text testID="onboarding-picture-placeholder" style={styles.avatarPlaceholderText}>
                    {(name.trim().charAt(0) || '?').toUpperCase()}
                  </Text>
                )}
                {/* A plain initial-letter circle reads as decorative, not
                    tappable — unlike Settings' own picture picker (a full
                    card with a visible "Choose a picture" button label),
                    this one has no room for a text label at this compact
                    size. A small "+" badge is the same minimal, widely
                    understood affordance most apps use for "tap to add a
                    photo", without needing extra layout space. */}
                {!pictureUri && (
                  <View testID="onboarding-picture-add-badge" style={styles.avatarAddBadge}>
                    <Text style={styles.avatarAddBadgeText}>+</Text>
                  </View>
                )}
              </AnimatedPressable>
              <View style={styles.nameInputColumn}>
                {/* No `label` prop here (unlike Settings' equivalent name
                    field): the styles.label Text above this whole row
                    already serves as this card's heading for BOTH the
                    avatar picker and this input together, matching the
                    Age/Language cards' own external-label pattern in the
                    same row — giving this TextInput its own duplicate
                    floating label would double up on that heading without
                    covering the avatar it also labels. mode="outlined" +
                    dense still gets the polished animated border and
                    correctly themed focus state from the nice
                    outlined style, just keyed off the existing
                    placeholder instead of a label. */}
                <TextInput
                  mode="outlined"
                  dense
                  testID="onboarding-name-input"
                  value={name}
                  onChangeText={handleNameChange}
                  maxLength={CHILD_NAME_MAX_LENGTH}
                  placeholder="Name"
                  outlineColor={nameValid ? colors.bubblegumDark : colors.line}
                  activeOutlineColor={colors.bubblegumDark}
                  style={[styles.textInput, nameValid && styles.textInputFilled]}
                />
                {pictureUri && (
                  <Text
                    testID="onboarding-picture-remove"
                    onPress={() => setPictureUri(undefined)}
                    style={styles.removePictureLink}
                  >
                    {t('profilePictureRemove')}
                  </Text>
                )}
              </View>
            </View>
            {!nameValid && (
              <Text testID="onboarding-name-error" style={styles.fieldError}>
                ⚠ {t('onboardingNameMissing')}
              </Text>
            )}
          </View>
        </RaisedCard>

        <RaisedCard color={colors.surface} borderColor={colors.line} style={styles.halfCard} elevationLevel="level2">
          <View style={styles.cardContent}>
            <Text style={styles.label}>{t('onboardingAge')}</Text>
            <AgePicker
              value={age}
              onChange={setAge}
              visible={ageModalVisible}
              onOpen={() => setAgeModalVisible(true)}
              onClose={() => setAgeModalVisible(false)}
              placeholder={t('onboardingSelectAge')}
              testIDPrefix="onboarding-age"
              variant="playful"
            />
            {!ageValid && (
              <Text testID="onboarding-age-error" style={styles.fieldError}>
                ⚠ {t('onboardingAgeMissing')}
              </Text>
            )}
          </View>
        </RaisedCard>
      </View>

      <View style={styles.row}>
        <RaisedCard color={colors.surface} borderColor={colors.line} style={styles.halfCard} elevationLevel="level2">
          <View style={styles.cardContent}>
            <Text style={styles.label}>{t('onboardingLanguage')}</Text>
            <LanguageSelector
              value={language}
              onChange={(next) => setLanguage(next)}
              visible={languageModalVisible}
              onOpen={() => setLanguageModalVisible(true)}
              onClose={() => setLanguageModalVisible(false)}
              testIDPrefix="onboarding-lang"
              variant="playful"
            />
          </View>
        </RaisedCard>

        <RaisedCard color={colors.surface} borderColor={colors.line} style={styles.halfCard} elevationLevel="level2">
          <View style={styles.cardContent}>
            <AnimatedPressable
              testID="onboarding-folder-picker"
              onPress={handlePickFolder}
              tilt="compact"
              hitSlop={{ top: 6, bottom: 6 }}
              style={styles.folderButtonOuter}
              innerStyle={styles.folderButton}
            >
              <Text style={styles.folderButtonText}>{t('onboardingPickFolder')}</Text>
            </AnimatedPressable>
            {folderUri && (
              <View style={styles.folderConfirm}>
                <Text style={styles.folderConfirmCheck}>✓</Text>
                <Text testID="onboarding-folder-picked" style={styles.folderConfirmText}>
                  {toReadableFolderPath(folderUri)}
                </Text>
              </View>
            )}
            {!folderValid && (
              <Text testID="onboarding-folder-error" style={styles.fieldError}>
                ⚠ {t('onboardingFolderMissing')}
              </Text>
            )}
          </View>
        </RaisedCard>
      </View>

      <View style={styles.saveWrapper}>
        <RaisedPrimaryButton
          testID="onboarding-save-button"
          label={t('onboardingSave')}
          onPress={handleSave}
          disabled={saveDisabled}
          size="large"
          style={styles.saveButton}
        />
      </View>

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
    alignItems: 'stretch',
    // Centered rather than top-anchored, matching this screen's short, wide
    // landscape viewport (see RootNavigator.tsx's orientation lock) —
    // flexGrow:1 already handles the reverse case too: a smaller screen or
    // more content still scrolls normally, since a ScrollView never clips
    // content shorter than justifyContent would otherwise want to show.
    justifyContent: 'center',
  },
  brandBadge: {
    fontSize: 22,
    textAlign: 'center',
    marginTop: spacing.xxs,
    marginBottom: 0,
  },
  // title/subtitle sit directly on the sky gradient background (not a
  // card). `colors.ink` is used rather than `colors.white`: white only
  // clears ~2:1-3.1:1 against sky/skyDark, well under what this text needs,
  // while `colors.ink` clears comfortably higher across the same range —
  // subtitle uses a 0.9 (not the old 0.85) alpha fade so its still-smaller
  // text keeps a 4.5:1 minimum even at the skyDark end.
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.xxs,
    marginBottom: spacing.xxs,
  },
  subtitle: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
    color: withAlpha(colors.ink, 0.9),
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  halfCard: {
    flex: 1,
    marginBottom: 0,
  },
  cardContent: {
    padding: spacing.sm,
  },
  label: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  avatarOuter: {
    width: 44,
    height: 44,
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.violetSoft,
    borderWidth: 2,
    borderColor: colors.violetDark,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholderText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.violetDark,
  },
  // Sits fully INSIDE the circle's own bounds (not overlapping its edge) —
  // avatarButton's overflow:'hidden' (needed to clip a chosen picture into
  // a circle) would otherwise clip off anything positioned past its border.
  avatarAddBadge: {
    position: 'absolute',
    // Flush bottom:0/right:0 would put this badge's own outer corner
    // ~31px from the 44x44 circle's center — outside its 22px radius, so
    // avatarButton's circular overflow:'hidden' would clip a real chunk of
    // it into a lens shape. Insetting by 8 on both edges keeps the badge's
    // own farthest corner within the circle's radius (~21px from center),
    // so the full circular badge renders uncropped.
    bottom: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.violetDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAddBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.white,
    lineHeight: 12,
  },
  nameInputColumn: {
    flex: 1,
  },
  removePictureLink: {
    marginTop: spacing.xxs,
    fontSize: 12,
    fontWeight: '700',
    color: colors.berryDark,
  },
  textInput: {
    backgroundColor: colors.surfaceSunk,
    fontSize: 17,
  },
  textInputFilled: {
    backgroundColor: colors.bubblegumSoft,
  },
  folderButtonOuter: {
    alignSelf: 'stretch',
  },
  folderButton: {
    backgroundColor: colors.marigold,
    borderWidth: 2,
    borderColor: colors.marigoldDark,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  folderButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  folderConfirm: {
    marginTop: spacing.xs,
    backgroundColor: colors.jadeSoft,
    borderRadius: radii.md,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xs,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  folderConfirmCheck: {
    color: colors.jadeDark,
    fontWeight: '800',
    fontSize: 14,
  },
  folderConfirmText: {
    color: colors.jadeDark,
    fontWeight: '700',
    fontSize: 13,
  },
  fieldError: {
    marginTop: spacing.xs,
    color: colors.berryDark,
    fontSize: 13,
    fontWeight: '700',
  },
  saveWrapper: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  saveButton: {
    minWidth: 220,
  },
});
