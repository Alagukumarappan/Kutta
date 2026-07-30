import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { getProfile, saveProfile } from '../storage/profileStore';
import { requestFolderAccess } from '../storage/folderAccess';
import { migrateContent } from '../storage/folderMigration';
import { toReadableFolderPath } from '../storage/folderPathDisplay';
import { AgePicker } from '../components/AgePicker';
import type { Language, Profile } from '../types/profile';
import { colors, radii, spacing, shadow } from '../theme/tokens';

export function SettingsScreen({ onProfileChanged }: { onProfileChanged?: () => void } = {}) {
  const { t, setLanguage } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [ageModalVisible, setAgeModalVisible] = useState(false);
  const [pendingFolderUri, setPendingFolderUri] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  useEffect(() => {
    getProfile().then((p) => {
      setProfile(p);
      if (p) setAge(p.age);
    });
  }, []);

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

  async function handleSave() {
    if (!profile || migrating) return;
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
  }

  if (!profile) return <View testID="settings-loading" style={styles.screen} />;

  const displayedFolderUri = pendingFolderUri ?? profile.rootFolderUri;

  return (
    <View testID="settings-loaded" style={styles.screen}>
      <Text style={styles.title}>{t('settingsTitle')}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>{t('onboardingName')}</Text>
        <TextInput
          testID="settings-name-input"
          value={profile.name}
          onChangeText={(name) => setProfile({ ...profile, name })}
          style={styles.textInput}
        />
      </View>

      <View style={styles.card}>
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

      <View style={styles.card}>
        <Text style={styles.label}>{t('onboardingLanguage')}</Text>
        <View style={styles.languageRow}>
          <Pressable
            testID="settings-lang-en"
            onPress={() => setProfile({ ...profile, language: 'en' as Language })}
            style={[styles.langPill, profile.language === 'en' ? styles.langPillSelected : styles.langPillUnselected]}
          >
            <Text
              style={[
                styles.langPillText,
                profile.language === 'en' ? styles.langPillTextSelected : styles.langPillTextUnselected,
              ]}
            >
              English
            </Text>
          </Pressable>
          <Pressable
            testID="settings-lang-de"
            onPress={() => setProfile({ ...profile, language: 'de' as Language })}
            style={[styles.langPill, profile.language === 'de' ? styles.langPillSelected : styles.langPillUnselected]}
          >
            <Text
              style={[
                styles.langPillText,
                profile.language === 'de' ? styles.langPillTextSelected : styles.langPillTextUnselected,
              ]}
            >
              Deutsch
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t('settingsFolder')}</Text>
        {displayedFolderUri && (
          <View style={styles.folderConfirm}>
            <Text testID="settings-folder-path" style={styles.folderConfirmText}>
              {toReadableFolderPath(displayedFolderUri)}
            </Text>
          </View>
        )}
        <Pressable onPress={handlePickFolder} style={styles.folderButton}>
          <Text style={styles.folderButtonText}>{t('settingsChangeFolder')}</Text>
        </Pressable>
      </View>

      {migrating && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>{t('migrationInProgress')}</Text>
        </View>
      )}
      {migrationError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{migrationError}</Text>
        </View>
      )}

      <Pressable
        testID="settings-save"
        onPress={handleSave}
        disabled={migrating}
        style={[styles.saveButton, migrating ? styles.saveButtonDisabled : styles.saveButtonEnabled]}
      >
        <Text style={[styles.saveButtonText, migrating ? styles.saveButtonTextDisabled : styles.saveButtonTextEnabled]}>
          {t('settingsSave')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: colors.background,
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
  folderConfirm: {
    marginBottom: spacing.sm,
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
  infoBanner: {
    backgroundColor: colors.sun,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  infoBannerText: {
    color: colors.ink,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: colors.coral,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    color: colors.white,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  saveButton: {
    borderRadius: radii.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
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
