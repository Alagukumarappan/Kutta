import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { paperTheme } from './src/design-system/paperTheme';

// PaperProvider wraps everything else (including SafeAreaProvider and, one
// level deeper inside RootNavigator, LanguageProvider/NavigationContainer)
// so any react-native-paper component used anywhere in the tree — this
// iteration's new design-system Buttons, and whatever future
// iterations add — picks up Kutta's own MD3 theme (see
// src/design-system/paperTheme.ts) instead of Paper's stock purple
// defaults. Nothing about the existing provider nesting below changes: this
// is purely one new provider added at the very top.
export default function App() {
  return (
    <PaperProvider theme={paperTheme}>
      <SafeAreaProvider>
        <RootNavigator />
      </SafeAreaProvider>
    </PaperProvider>
  );
}
