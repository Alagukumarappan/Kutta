import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { motion, tilt as tiltPresets } from './tokens';
import { useReducedMotion } from './useReducedMotion';

export type TiltVariant = keyof typeof tiltPresets;

// Generalizes the exact "tilt and lift" press-feedback recipe that
// HomeScreen's cardScales/cardTiltStyle and QuestionRenderer's
// optionScales/optionTiltStyle each hand-rolled independently (see the
// detailed rationale comment on HomeScreen's cardScales — RN's Animated
// bundled API, not react-native-reanimated, since the latter isn't actually
// wired into babel/Jest in this codebase yet). Every new shared component
// that needs the same "press in -> tilt+lift+scale down, press out -> spring
// back to rest" feedback (AnimatedPressable, RaisedCard, the raised buttons)
// calls this ONE hook instead of re-deriving the interpolation math a fourth
// and fifth time.
export function useTiltPress(variant: TiltVariant = 'regular') {
  const config = tiltPresets[variant];
  const driver = useRef(new Animated.Value(1)).current;
  const activeAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  // With reduce-motion enabled, this press feedback's 3D tilt/lift (a
  // parallax-like transform, not just a fade) is exactly the kind of motion
  // the OS setting exists to suppress — see useReducedMotion.ts and the
  // same treatment already applied to CelebrationOverlay/QuizScreen's score
  // card. Applied centrally here (the one shared hook every raised
  // button/card/pressable in the app calls) rather than at each of its many
  // call sites, so this fix reaches all of them at once without touching
  // HomeScreen, QuestionRenderer, RaisedCard, or the raised buttons
  // individually.
  const reducedMotion = useReducedMotion();

  // Stop (don't leave running) any in-flight spring on unmount — same
  // convention as HomeScreen's activeAnimationsRef/QuestionRenderer's
  // activeOptionAnimationsRef cleanup effects, so a component using this
  // hook can't leak a native-driver animation callback past its own
  // lifetime.
  useEffect(() => {
    return () => {
      activeAnimationRef.current?.stop();
    };
  }, []);

  function animateTo(toValue: number) {
    if (reducedMotion) {
      // Jump straight to the target value — still communicates "pressed"
      // (every interpolation below still reflects the new driver value
      // instantly), just without the spring/bounce/tilt motion itself.
      activeAnimationRef.current?.stop();
      driver.setValue(toValue);
      return;
    }
    const animation = Animated.spring(driver, {
      toValue,
      useNativeDriver: true,
      ...motion.spring.pressGentle,
    });
    activeAnimationRef.current = animation;
    animation.start();
  }

  const onPressIn = () => animateTo(config.pressedScale);
  const onPressOut = () => animateTo(1);

  // Snaps immediately back to resting (no tilt) without animating — for
  // callers that need to guarantee a clean, static state the instant some
  // other condition becomes true (e.g. QuestionRenderer stops every
  // option's tilt the moment an answer is revealed, so no stale tilt can
  // linger into the highlighted correct/incorrect state).
  function reset() {
    activeAnimationRef.current?.stop();
    driver.setValue(1);
  }

  const style = {
    transform: [
      { perspective: config.perspective },
      { rotateX: driver.interpolate({ inputRange: [config.pressedScale, 1], outputRange: [`${config.rotateXDeg}deg`, '0deg'] }) },
      { rotateY: driver.interpolate({ inputRange: [config.pressedScale, 1], outputRange: [`${config.rotateYDeg}deg`, '0deg'] }) },
      { translateY: driver.interpolate({ inputRange: [config.pressedScale, 1], outputRange: [config.liftPx, 0] }) },
      { scale: driver },
    ],
  };

  return { style, onPressIn, onPressOut, reset, driver };
}
