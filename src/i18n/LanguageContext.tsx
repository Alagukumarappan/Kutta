import React, { createContext, useContext, useMemo, useState } from 'react';
import type { Language } from '../types/profile';
import { t as translate, StringKey } from './strings';

interface LanguageContextValue {
  language: Language;
  setLanguage: (l: Language) => void;
  t: (key: StringKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: Language;
  children: React.ReactNode;
}) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  // `useState(initialLanguage)` only reads the prop on the FIRST render of
  // this provider instance — and RootNavigator renders a LanguageProvider at
  // the same position in its tree both while the profile is still loading
  // (splash, where there is no saved language yet so it passes "en") and
  // afterwards (with the profile's real language). React reconciles those
  // two renders as the SAME element type at the SAME position, so the
  // provider is UPDATED, not remounted: the "en" from the splash render
  // stuck forever, and every German-profile child saw the whole app in
  // English on every single launch until a parent went into Settings and
  // re-saved the language (which works only because SettingsScreen calls
  // `setLanguage` directly). Re-deriving from the prop when it actually
  // changes is React's documented "adjust state when a prop changes"
  // pattern — done during render (not in an effect) so the corrected
  // language is used for the very first paint of the real screen, with no
  // flash of the wrong language. `setLanguage` still wins for any change
  // that doesn't come from a new `initialLanguage` (Settings' own save
  // calls it, and then re-renders this provider with a MATCHING prop, so
  // the two can't fight each other).
  const [appliedInitialLanguage, setAppliedInitialLanguage] = useState<Language>(initialLanguage);
  if (appliedInitialLanguage !== initialLanguage) {
    setAppliedInitialLanguage(initialLanguage);
    setLanguage(initialLanguage);
  }

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key: StringKey) => translate(key, language),
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
