import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { colors, elevation, radii, spacing, typography } from './tokens';
import { RaisedPrimaryButton } from './Buttons';

// The richer "empty-state panel" the brief calls for: icon/emoji + TITLE +
// message + an optional action button, replacing the current bare-text (or,
// in `src/components/EmptyState.tsx`'s case, emoji+message-only) empty
// states with something that can also tell a parent what to do about it
// (e.g. "Add pictures" straight from an empty gallery) rather than just
// describing the absence.
//
// Deliberately a NEW, separate component rather than an edit to the
// existing `src/components/EmptyState.tsx` — that component is still used
// by today's (not-yet-redesigned) galleries and screens, and this iteration
// is scoped to the shared foundation only; migrating each gallery over to
// this richer panel (with its own title copy and action wiring) is
// screen-level redesign work for a later iteration.
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

  // Same gentle, slow, looping bounce EmptyState already established (no
  // flashing, no rapid motion) — stopped and cleaned up on unmount so it
  // never keeps animating off-screen.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bounce]);

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
