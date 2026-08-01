import React from 'react';
import { Animated, Modal, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { colors, elevation, motion, radii, spacing, typography } from './tokens';
import { SurfaceWash } from './SurfaceWash';
import { RaisedPrimaryButton, RaisedSecondaryButton } from './Buttons';
import { useReducedMotion } from './useReducedMotion';

export interface CelebrationAction {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: 'primary' | 'secondary';
  testID?: string;
}

// Generalizes the Modal-based "pop-in feedback panel, optionally with a
// bigger celebratory bubble on top" pattern QuestionRenderer's answer
// feedback and PuzzleScreen's completion feedback each built by hand: a
// dimmed backdrop, a centered card that springs/fades in, an optional
// emoji+message "celebration" flourish, a title/message, and 1-2 action
// buttons. Any future screen that needs this exact shape (a completed
// activity, a milestone, a friendly error moment) renders one of these
// instead of re-deriving the Animated.Value + Modal wiring a third time.
export function CelebrationOverlay({
  visible,
  tone = 'success',
  emoji,
  title,
  message,
  actions = [],
  testID = 'celebration-overlay',
}: {
  visible: boolean;
  // 'success' tints the wash mint/jade-ish and shows the small bouncing
  // celebration bubble; 'neutral' skips the bubble and uses a plain surface
  // tint — for a friendly informational moment that isn't a "you did it!"
  // (e.g. an empty-state confirmation), not an error.
  tone?: 'success' | 'neutral';
  emoji?: string;
  title: string;
  message?: string;
  actions?: CelebrationAction[];
  testID?: string;
}) {
  const reducedMotion = useReducedMotion();
  const scaleAnim = React.useRef(new Animated.Value(0.85)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;
  const bubbleScaleAnim = React.useRef(new Animated.Value(0)).current;
  const bubbleOpacityAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!visible) {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
      bubbleScaleAnim.setValue(0);
      bubbleOpacityAnim.setValue(0);
      return;
    }

    // With reduce-motion enabled, skip the bouncy scale/spring entirely —
    // that kind of overshooting transform is exactly what the OS setting
    // exists to suppress (a real vestibular-safety need, not just a style
    // preference). Jump the scale straight to its resting value and animate
    // only opacity, so the moment still reads as "this appeared" via a
    // plain fade without any scaling or bounce.
    let cardEntrance: Animated.CompositeAnimation;
    if (reducedMotion) {
      scaleAnim.setValue(1);
      cardEntrance = Animated.timing(opacityAnim, { toValue: 1, duration: motion.duration.base, useNativeDriver: true });
    } else {
      cardEntrance = Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, ...motion.spring.popBouncy }),
        Animated.timing(opacityAnim, { toValue: 1, duration: motion.duration.base, useNativeDriver: true }),
      ]);
    }
    cardEntrance.start();

    let bubbleAnimation: Animated.CompositeAnimation | null = null;
    if (tone === 'success' && emoji) {
      let bubbleEntrance: Animated.CompositeAnimation;
      if (reducedMotion) {
        bubbleScaleAnim.setValue(1);
        bubbleEntrance = Animated.timing(bubbleOpacityAnim, {
          toValue: 1,
          duration: motion.duration.fast,
          useNativeDriver: true,
        });
      } else {
        bubbleEntrance = Animated.parallel([
          Animated.spring(bubbleScaleAnim, { toValue: 1, useNativeDriver: true, ...motion.spring.celebrate }),
          Animated.timing(bubbleOpacityAnim, { toValue: 1, duration: motion.duration.fast, useNativeDriver: true }),
        ]);
      }
      bubbleAnimation = Animated.sequence([
        bubbleEntrance,
        Animated.delay(motion.duration.celebration),
        Animated.timing(bubbleOpacityAnim, { toValue: 0, duration: motion.duration.slow, useNativeDriver: true }),
      ]);
      bubbleAnimation.start();
    }

    return () => {
      cardEntrance.stop();
      bubbleAnimation?.stop();
    };
  }, [visible, tone, emoji, reducedMotion, scaleAnim, opacityAnim, bubbleScaleAnim, bubbleOpacityAnim]);

  if (!visible) return null;

  const washTint = tone === 'success' ? colors.jade : colors.violet;
  const washShade = tone === 'success' ? colors.jadeDark : colors.violetDark;

  return (
    <Modal visible transparent animationType="fade" testID={testID}>
      <View style={styles.backdrop}>
        <Animated.View
          style={[styles.card, elevation.level5, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
        >
          <View style={styles.cardClip}>
            <SurfaceWash tint={washTint} shade={washShade} />

            {tone === 'success' && emoji && (
              <Animated.View
                testID="celebration-bubble"
                style={[
                  styles.bubble,
                  { opacity: bubbleOpacityAnim, transform: [{ scale: bubbleScaleAnim }] },
                ]}
              >
                <Text style={styles.bubbleEmoji}>{emoji}</Text>
              </Animated.View>
            )}

            <Text style={styles.title}>{title}</Text>
            {message && <Text style={styles.message}>{message}</Text>}

            {actions.length > 0 && (
              <View style={styles.actionRow}>
                {actions.map((action) =>
                  action.variant === 'secondary' ? (
                    <RaisedSecondaryButton
                      key={action.label}
                      testID={action.testID}
                      label={action.label}
                      onPress={action.onPress}
                      size="compact"
                    />
                  ) : (
                    <RaisedPrimaryButton
                      key={action.label}
                      testID={action.testID}
                      label={action.label}
                      onPress={action.onPress}
                      size="compact"
                    />
                  )
                )}
              </View>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlayScrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderRadius: radii.xl,
    maxWidth: 440,
    width: '100%',
  },
  cardClip: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    overflow: 'hidden',
    padding: spacing.lg,
    alignItems: 'center',
  },
  bubble: {
    marginBottom: spacing.sm,
  },
  bubbleEmoji: {
    fontSize: 48,
  },
  title: {
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  message: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    columnGap: spacing.sm,
    marginTop: spacing.xs,
  },
});
