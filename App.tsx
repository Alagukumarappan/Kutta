import React, { useEffect } from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { RootNavigator } from './src/navigation/RootNavigator';
import { paperTheme } from './src/design-system/paperTheme';

// Android 12+ shows its OWN native system splash screen automatically, on
// top of everything, until the app explicitly tells it to go away — and
// without this call, some OEM builds (confirmed on a real Samsung device)
// never auto-dismiss it at all, leaving the app stuck behind a blank
// screen with just the OS's own loading indicator forever, even though the
// real app underneath (this file's own React tree, RootNavigator's real
// SplashScreen, music, everything) is running completely normally. Calling
// this at module load, before the first render, guarantees we — not an
// unreliable OS heuristic — control exactly when that native overlay is
// removed.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Best-effort: if this call itself fails (e.g. called too late on some
  // platform), the explicit hideAsync() below still runs and is harmless
  // either way.
});

// PaperProvider wraps everything else (including SafeAreaProvider and, one
// level deeper inside RootNavigator, LanguageProvider/NavigationContainer)
// so any react-native-paper component used anywhere in the tree — this
// iteration's new design-system Buttons, and whatever future
// iterations add — picks up Kutta's own MD3 theme (see
// src/design-system/paperTheme.ts) instead of Paper's stock purple
// defaults. Nothing about the existing provider nesting below changes: this
// is purely one new provider added at the very top.
export default function App() {
  // Hides the native splash the moment THIS tree has painted its first
  // frame — handing off immediately to RootNavigator's own in-JS
  // SplashScreen (a real spinner + tagline), rather than waiting for the
  // profile/content-folder resolution RootNavigator's splash itself holds
  // up for. Never gates on anything that could hang.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {
      // Best-effort -- see the module-level comment above.
    });
  }, []);

  return (
    <PaperProvider theme={paperTheme}>
      <SafeAreaProvider>
        <RootNavigator />
      </SafeAreaProvider>
    </PaperProvider>
  );
}
