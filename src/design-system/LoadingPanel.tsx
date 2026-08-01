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
  testID,
}: {
  color?: string;
  message?: string;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.container}>
      <ActivityIndicator size="large" color={color} />
      {message && <Text style={styles.message}>{message}</Text>}
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
