import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet, ScrollView } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { requestFolderAccess, ensureContentStructure } from '../storage/folderAccess';
import { saveProfile } from '../storage/profileStore';
import { toReadableFolderPath } from '../storage/folderPathDisplay';
import { AgePicker } from '../components/AgePicker';
import type { Language } from '../types/profile';
import { colors, radii, spacing, shadow } from '../theme/tokens';

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { t, language, setLanguage } = useLanguage();
  const [name, setName] = useState('');
  const [age, setAge] = useState<number | null>(null);
  const [ageModalVisible, setAgeModalVisible] = useState(false);
  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      await saveProfile({ name: name.trim(), age, language, rootFolderUri: folderUri });
      onComplete();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.screen}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{t('onboardingTitle')}</Text>

      <View style={styles.row}>
        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.label}>{t('onboardingName')}</Text>
          <TextInput
            testID="onboarding-name-input"
            value={name}
            onChangeText={setName}
            style={styles.textInput}
            placeholder="Name"
          />
          {!nameValid && (
            <Text testID="onboarding-name-error" style={styles.fieldError}>
              {t('onboardingNameMissing')}
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
              {t('onboardingAgeMissing')}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.label}>{t('onboardingLanguage')}</Text>
          <View style={styles.languageRow}>
            <Pressable
              testID="onboarding-lang-en"
              onPress={() => setLanguage('en' as Language)}
              style={[styles.langPill, language === 'en' ? styles.langPillSelected : styles.langPillUnselected]}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              <Text style={[styles.langPillText, language === 'en' ? styles.langPillTextSelected : styles.langPillTextUnselected]}>
                English
              </Text>
            </Pressable>
            <Pressable
              testID="onboarding-lang-de"
              onPress={() => setLanguage('de' as Language)}
              style={[styles.langPill, language === 'de' ? styles.langPillSelected : styles.langPillUnselected]}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              <Text style={[styles.langPillText, language === 'de' ? styles.langPillTextSelected : styles.langPillTextUnselected]}>
                Deutsch
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, styles.halfCard]}>
          <Pressable
            testID="onboarding-folder-picker"
            onPress={handlePickFolder}
            style={styles.folderButton}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Text style={styles.folderButtonText}>{t('onboardingPickFolder')}</Text>
          </Pressable>
          {folderUri && (
            <View style={styles.folderConfirm}>
              <Text testID="onboarding-folder-picked" style={styles.folderConfirmText}>
                {toReadableFolderPath(folderUri)}
              </Text>
            </View>
          )}
          {!folderValid && (
            <Text testID="onboarding-folder-error" style={styles.fieldError}>
              {t('onboardingFolderMissing')}
            </Text>
          )}
        </View>
      </View>

      <Pressable
        testID="onboarding-save-button"
        onPress={handleSave}
        disabled={saveDisabled}
        style={[styles.saveButton, saveDisabled ? styles.saveButtonDisabled : styles.saveButtonEnabled]}
      >
        <Text style={[styles.saveButtonText, saveDisabled ? styles.saveButtonTextDisabled : styles.saveButtonTextEnabled]}>
          {t('onboardingSave')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flexGrow: 1,
    padding: spacing.md,
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  halfCard: {
    flex: 1,
    marginBottom: 0,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow,
    elevation: 2,
  },
  label: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  textInput: {
    borderWidth: 2,
    borderColor: colors.disabledBorder,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 18,
    color: colors.ink,
  },
  languageRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  langPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.xl,
    alignItems: 'center',
    borderWidth: 2,
  },
  langPillSelected: {
    backgroundColor: colors.sky,
    borderColor: colors.skyDark,
  },
  langPillUnselected: {
    backgroundColor: colors.white,
    borderColor: colors.disabledBorder,
  },
  langPillText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  langPillTextSelected: {
    color: colors.white,
  },
  langPillTextUnselected: {
    color: colors.ink,
  },
  folderButton: {
    backgroundColor: colors.sky,
    borderRadius: radii.xl,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    ...shadow,
    elevation: 2,
  },
  folderButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  folderConfirm: {
    marginTop: spacing.sm,
    backgroundColor: colors.mint,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
  },
  folderConfirmText: {
    color: colors.white,
    fontWeight: 'bold',
    fontSize: 15,
  },
  fieldError: {
    marginTop: spacing.xs,
    color: colors.coralDark,
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    borderRadius: radii.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 2,
  },
  saveButtonEnabled: {
    backgroundColor: colors.coral,
    borderColor: colors.coralDark,
    ...shadow,
    elevation: 4,
  },
  saveButtonDisabled: {
    backgroundColor: colors.disabledBg,
    borderColor: colors.disabledBorder,
    elevation: 0,
    shadowOpacity: 0,
  },
  saveButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  saveButtonTextEnabled: {
    color: colors.white,
  },
  saveButtonTextDisabled: {
    color: colors.disabledText,
  },
});
