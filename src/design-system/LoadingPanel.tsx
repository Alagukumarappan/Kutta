import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from './tokens';

// Replaces the bare, totally blank `<View />` every gallery (Coloring,
// Puzzle, Video) previously rendered while its folder listing loaded — on a
// slow device or a large folder, a child would stare at an empty canvas with
// zero feedback that anything was happening at all. This gives every loading
// moment the same small, calm signal: a spinner tinted with that screen's
// own activity accent (so it still reads as "the Coloring screen" etc. even
// before any content has appeared) plus an optional short, friendly line of
// text. Deliberately just a spinner — no entrance animation, no delay —
// since the brief is explicit that a loading state must never make a child
// wait through extra motion; it should appear instantly and disappear the
// moment real content is ready.
export function LoadingPanel({
  color = colors.violet,
  message,
  // Defaults to the original muted-ink tone, which still reads correctly
  // wherever this panel sits on a light/white surface (e.g.
  // ProfilePicturePicker's white modal card). Screens that render this
  // directly on the app's sky gradient background (no white card behind it)
  // pass colors.ink instead — inkMuted's own reduced contrast, and
  // colors.white's ~2:1-3.1:1 against sky/skyDark, both fall well under the
  // 4.5:1 this text needs, while full-strength colors.ink clears it
  // comfortably across the whole gradient.
  messageColor = colors.inkMuted,
  testID,
}: {
  color?: string;
  message?: string;
  messageColor?: string;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.container}>
      <ActivityIndicator size="large" color={color} />
      {message && <Text style={[styles.message, { color: messageColor }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  message: {
    marginTop: spacing.sm,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.inkMuted,
    textAlign: 'center',
  },
});
