import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { getProfile, saveProfile } from '../storage/profileStore';
import { requestFolderAccess } from '../storage/folderAccess';
import { migrateContent } from '../storage/folderMigration';
import type { Language, Profile } from '../types/profile';

export function SettingsScreen() {
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ageText, setAgeText] = useState('');
  const [pendingFolderUri, setPendingFolderUri] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  useEffect(() => {
    getProfile().then((p) => {
      setProfile(p);
      if (p) setAgeText(String(p.age));
    });
  }, []);

  async function handlePickFolder() {
    const uri = await requestFolderAccess();
    setPendingFolderUri(uri);
  }

  async function handleSave() {
    if (!profile) return;
    setMigrationError(null);

    const age = Number(ageText);
    let nextProfile: Profile = {
      ...profile,
      age: Number.isInteger(age) && age >= 2 && age <= 8 ? age : profile.age,
    };

    if (pendingFolderUri && pendingFolderUri !== profile.rootFolderUri) {
      setMigrating(true);
      const oldUri = profile.rootFolderUri;
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
  }

  if (!profile) return <View testID="settings-loading" />;

  return (
    <View testID="settings-loaded">
      <Text>{t('settingsTitle')}</Text>

      <TextInput
        testID="settings-name-input"
        value={profile.name}
        onChangeText={(name) => setProfile({ ...profile, name })}
      />

      <TextInput
        testID="settings-age-input"
        value={ageText}
        onChangeText={setAgeText}
        keyboardType="numeric"
      />

      <Pressable testID="settings-lang-en" onPress={() => setProfile({ ...profile, language: 'en' as Language })}>
        <Text>English</Text>
      </Pressable>
      <Pressable testID="settings-lang-de" onPress={() => setProfile({ ...profile, language: 'de' as Language })}>
        <Text>Deutsch</Text>
      </Pressable>

      <Pressable onPress={handlePickFolder}>
        <Text>{t('settingsChangeFolder')}</Text>
      </Pressable>

      {migrating && <Text>{t('migrationInProgress')}</Text>}
      {migrationError && <Text>{migrationError}</Text>}

      <Pressable onPress={handleSave}>
        <Text>{t('settingsSave')}</Text>
      </Pressable>
    </View>
  );
}
