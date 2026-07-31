import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, shadow } from '../theme/tokens';

const DOT_COLORS = [colors.coral, colors.sun, colors.mint, colors.sky, colors.periwinkle, colors.pink];

// A friendly, colorful placeholder for "nothing here yet" screens (galleries
// with no content). Previously these were a single bare <Text> — this gives
// young children something warm and alive to look at instead of a blunt
// sentence, without being distracting: one gentle, slow, looping bounce (no
// flashing, no rapid motion), stopped and cleaned up on unmount so it never
// keeps animating off-screen.
export function EmptyState({
  emoji,
  message,
  testID,
}: {
  emoji: string;
  message: string;
  testID?: string;
}) {
  const bounce = useRef(new Animated.Value(0)).current;

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
      <View style={styles.card}>
        <Animated.Text style={[styles.emoji, { transform: [{ translateY }] }]}>{emoji}</Animated.Text>
        <Text style={styles.message}>{message}</Text>
        <View
          testID="empty-state-dots"
          style={styles.dotRow}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {DOT_COLORS.map((color, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: color }]} />
          ))}
        </View>
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
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    maxWidth: 420,
    ...shadow,
    elevation: 2,
  },
  emoji: {
    fontSize: 56,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
  },
  dotRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
