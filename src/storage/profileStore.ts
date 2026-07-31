import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '../types/profile';

const PROFILE_KEY = 'kutta.profile.v1';

export async function getProfile(): Promise<Profile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

// Used by Settings' "Reset" flow to send the app back to onboarding — wipes
// the saved profile entirely rather than clearing individual fields, so
// getProfile() resolves to null again exactly like a first-ever launch.
export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_KEY);
}
