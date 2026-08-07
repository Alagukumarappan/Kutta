import React from 'react';
import {
  AccessibilityInfo,
  Animated,
  Modal,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
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
  onRequestClose,
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
  // Android's hardware/gesture back while this panel is up. REQUIRED (not
  // optional) on purpose: RN's Modal always registers a back-press callback
  // natively and dispatches the event to JS, so a Modal WITHOUT this prop
  // captures the press in its own window and silently drops it. Every
  // activity screen is headerShown:false (see RootNavigator), so back is the
  // child's only way out — and VideoPlayerScreen's completion panel offers
  // no exit action at all, which made a finished video a genuine dead end.
  // Making the prop required means a future host has to make that decision
  // deliberately (passing an explicit no-op) instead of inheriting a broken
  // back button by omission. Route it to whatever the NON-DESTRUCTIVE
  // "leave this panel" action is — the same convention QuestionRenderer's
  // feedback modal already follows.
  onRequestClose: () => void;
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

  // accessibilityRole="alert" + accessibilityLiveRegion="polite" on the
  // title (below) reliably notifies Android's TalkBack, but iOS VoiceOver
  // does not auto-announce on mount just because of that role - it needs an
  // explicit announcement. Fire one whenever the dialog actually becomes
  // visible, covering both the title and the message so a VoiceOver user
  // doesn't have to manually navigate to catch the message.
  React.useEffect(() => {
    if (!visible) return;
    AccessibilityInfo.announceForAccessibility(message ? `${title}. ${message}` : title);
  }, [visible, title, message]);

  // One presentation of this panel may only ever fire ONE of its exits.
  //
  // The per-screen guards each host already has are per-BUTTON (Puzzle's
  // retryFiredRef vs nextFiredRef, Tic-Tac-Toe's retryFiredRef vs
  // menuFiredRef), so they stop a double-tap on the same button but not two
  // different exits firing together. React Native's responder system hands
  // each concurrent touch to a different view and delivers the queued events
  // to JS in one batch, so a 2-8 year old putting two fingers down — one on
  // "Play Again", one on "Change setup" — really can run both handlers
  // against the same pre-update render: the board resets AND the screen pops
  // back to setup, i.e. state written into a screen that is on its way out.
  // Adding Android back as a third exit (below) would have widened exactly
  // the same hole, so the latch lives here, shared by every action and by
  // onRequestClose, instead of being re-derived per host.
  //
  // Re-armed during RENDER whenever the panel is not showing (not in an
  // effect, which would run a frame too late to be trusted), so the next
  // time it pops up its buttons are live again. Every host hides the panel
  // in response to its actions, so this cannot leave a still-visible panel
  // permanently dead.
  const actionLatchRef = React.useRef(false);
  if (!visible) actionLatchRef.current = false;

  function fireExit(run: () => void) {
    if (actionLatchRef.current) return;
    actionLatchRef.current = true;
    run();
  }

  if (!visible) return null;

  const washTint = tone === 'success' ? colors.jade : colors.violet;
  const washShade = tone === 'success' ? colors.jadeDark : colors.violetDark;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      testID={testID}
      onRequestClose={() => fireExit(onRequestClose)}
    >
      <View style={styles.backdrop}>
        <Animated.View
          testID="celebration-overlay-card"
          accessibilityViewIsModal
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

            <Text
              style={styles.title}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {title}
            </Text>
            {message && <Text style={styles.message}>{message}</Text>}

            {actions.length > 0 && (
              <View style={styles.actionRow}>
                {actions.map((action) =>
                  action.variant === 'secondary' ? (
                    <RaisedSecondaryButton
                      key={action.label}
                      testID={action.testID}
                      label={action.label}
                      onPress={(event) => fireExit(() => action.onPress(event))}
                      size="compact"
                    />
                  ) : (
                    <RaisedPrimaryButton
                      key={action.label}
                      testID={action.testID}
                      label={action.label}
                      onPress={(event) => fireExit(() => action.onPress(event))}
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
