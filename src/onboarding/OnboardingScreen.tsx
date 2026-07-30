import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { requestFolderAccess, ensureContentStructure } from '../storage/folderAccess';
import { saveProfile } from '../storage/profileStore';
import type { Language } from '../types/profile';

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { t, language, setLanguage } = useLanguage();
  const [name, setName] = useState('');
  const [ageText, setAgeText] = useState('');
  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const age = Number(ageText);
  const isValid = name.trim().length > 0 && Number.isInteger(age) && age >= 2 && age <= 8 && !!folderUri;

  async function handlePickFolder() {
    const uri = await requestFolderAccess();
    setFolderUri(uri);
  }

  async function handleSave() {
    if (!isValid || !folderUri) return;
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
    <View>
      <Text>{t('onboardingTitle')}</Text>

      <Text>{t('onboardingName')}</Text>
      <TextInput testID="onboarding-name-input" value={name} onChangeText={setName} />

      <Text>{t('onboardingAge')}</Text>
      <TextInput testID="onboarding-age-input" value={ageText} onChangeText={setAgeText} keyboardType="numeric" />

      <Text>{t('onboardingLanguage')}</Text>
      <Pressable testID="onboarding-lang-en" onPress={() => setLanguage('en' as Language)}>
        <Text>English</Text>
      </Pressable>
      <Pressable testID="onboarding-lang-de" onPress={() => setLanguage('de' as Language)}>
        <Text>Deutsch</Text>
      </Pressable>

      <Pressable onPress={handlePickFolder}>
        <Text>{t('onboardingPickFolder')}</Text>
      </Pressable>
      {folderUri && <Text testID="onboarding-folder-picked">✓</Text>}

      <Pressable onPress={handleSave} disabled={!isValid || saving}>
        <Text>{t('onboardingSave')}</Text>
      </Pressable>
    </View>
  );
}
