import React, { useState } from 'react';
import { View, Text, TextInput, Image, Alert, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
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
export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { t, language, setLanguage } = useLanguage();
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

  const nameValid = name.trim().length > 0;
  const ageValid = age !== null;
  const folderValid = !!folderUri;
  const isValid = nameValid && ageValid && folderValid;
  const saveDisabled = !isValid || saving;

  async function handlePickFolder() {
    try {
      const uri = await requestFolderAccess();
      setFolderUri(uri);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSave() {
    if (!isValid || !folderUri || age === null) return;
    setSaving(true);
    try {
      await ensureContentStructure(folderUri);
      await saveProfile({ name: name.trim(), age, language, rootFolderUri: folderUri, pictureUri });
      onComplete();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.outer}>
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.screen}
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
              </AnimatedPressable>
              <View style={styles.nameInputColumn}>
                <TextInput
                  testID="onboarding-name-input"
                  value={name}
                  onChangeText={setName}
                  style={[styles.textInput, nameValid ? styles.textInputFilled : styles.textInputEmpty]}
                  placeholder="Name"
                  placeholderTextColor={colors.inkMuted}
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
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.canvas,
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
  },
  brandBadge: {
    fontSize: 22,
    textAlign: 'center',
    marginTop: spacing.xxs,
    marginBottom: 0,
  },
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
    color: colors.inkMuted,
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
    borderWidth: 2,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    fontSize: 17,
    color: colors.ink,
    backgroundColor: colors.surfaceSunk,
  },
  textInputEmpty: {
    borderColor: colors.line,
  },
  textInputFilled: {
    borderColor: colors.bubblegumDark,
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
