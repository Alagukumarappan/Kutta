import React from 'react';
import { Animated, Pressable, type StyleProp, type ViewStyle, type GestureResponderEvent } from 'react-native';
import { useTiltPress, type TiltVariant } from './useTiltPress';

// The reusable "tilt and lift" pressable wrapper the brief calls for:
// generalizes the identical recipe HomeScreen's card Pressable/cardFace
// split and QuestionRenderer's option Pressable/optionCard split each
// implemented by hand. Any new screen/component that wants this same
// dimensional press feedback wraps its content in this instead of
// reinventing the Animated.Value + spring + interpolate wiring again.
//
// Deliberately mirrors the outer-Pressable/inner-Animated.View split those
// two screens already use: the Pressable itself carries layout (sizing, hit
// area) and is never animated, while a separate inner Animated.View carries
// the transform (and, per that same established reasoning, should carry any
// border/shadow the caller wants, via `innerStyle`) — so the tilt transform
// can never distort this component's own hit box.
export function AnimatedPressable({
  children,
  onPress,
  onLongPress,
  disabled,
  tilt = 'regular',
  style,
  innerStyle,
  testID,
  accessibilityRole,
  accessibilityLabel,
  hitSlop,
}: {
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  // Which tilt geometry preset (from design-system/tokens.ts's `tilt`) to
  // use — 'compact' for smaller/closer-together controls, matching
  // QuestionRenderer's own reasoning for using a gentler angle on its 4
  // answer options than HomeScreen uses on its 4 full-size cards.
  tilt?: TiltVariant;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityRole?: 'button' | 'none' | 'image' | 'link';
  accessibilityLabel?: string;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
}) {
  const { style: tiltStyle, onPressIn, onPressOut, reset } = useTiltPress(tilt);

  // A disabled control shouldn't visibly tilt if a stray pressIn/pressOut
  // still lands on it mid-transition (e.g. it became disabled between
  // pressIn and pressOut) — snap back to rest defensively whenever
  // `disabled` flips true, the same "guarantee a clean static state" use
  // QuestionRenderer's own reset-on-hasAnswered effect already established
  // for its option tilts.
  React.useEffect(() => {
    if (disabled) reset();
  }, [disabled, reset]);

  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      onPressIn={disabled ? undefined : onPressIn}
      onPressOut={disabled ? undefined : onPressOut}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled ? { disabled: true } : undefined}
      hitSlop={hitSlop}
      style={style}
    >
      <Animated.View style={[tiltStyle, innerStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
