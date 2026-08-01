import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { colors, elevation, radii, spacing, typography } from './tokens';
import { RaisedPrimaryButton } from './Buttons';
import { useReducedMotion } from './useReducedMotion';

// The richer "empty-state panel" the brief calls for: icon/emoji + TITLE +
// message + an optional action button, replacing the old bare-text (or,
// in the now-removed `src/components/EmptyState.tsx`'s case,
// emoji+message-only) empty states with something that can also tell a
// parent what to do about it (e.g. "Add pictures" straight from an empty
// gallery) rather than just describing the absence.
//
// Originally created as a new, separate component rather than an edit to
// `src/components/EmptyState.tsx`, since that component was still used by
// the not-yet-redesigned galleries at the time and this iteration was
// scoped to the shared foundation only. All three galleries (Coloring,
// Puzzle, Video) have since migrated to this component; the old one had
// no remaining callers and was deleted in a later quality pass.
export function EmptyStatePanel({
  emoji,
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: {
  emoji: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: (event: GestureResponderEvent) => void;
  testID?: string;
}) {
  const bounce = useRef(new Animated.Value(0)).current;
  // A CONTINUOUS/infinite loop is exactly the kind of motion the OS
  // reduce-motion setting exists to suppress — unlike a one-time pop-in
  // that finishes in well under a second, this bounce keeps running for as
  // long as the empty state stays on screen. Checked here rather than
  // deferred like the app's other one-shot spring animations were.
  const reducedMotion = useReducedMotion();

  // Same gentle, slow, looping bounce EmptyState already established (no
  // flashing, no rapid motion) — stopped and cleaned up on unmount so it
  // never keeps animating off-screen.
  useEffect(() => {
    if (reducedMotion) {
      bounce.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bounce, reducedMotion]);

  const translateY = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <View testID={testID} style={styles.container}>
      <View style={[styles.card, elevation.level2]}>
        <Animated.Text style={[styles.emoji, { transform: [{ translateY }] }]}>{emoji}</Animated.Text>
        <Text style={styles.title}>{title}</Text>
        {message && <Text style={styles.message}>{message}</Text>}
        {actionLabel && onAction && (
          <View style={styles.actionWrapper}>
            <RaisedPrimaryButton testID={testID ? `${testID}-action` : undefined} label={actionLabel} onPress={onAction} size="compact" />
          </View>
        )}
      </View>
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
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    maxWidth: 440,
  },
  emoji: {
    fontSize: 56,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.ink,
    textAlign: 'center',
  },
  message: {
    marginTop: spacing.xxs,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  actionWrapper: {
    marginTop: spacing.md,
  },
});
