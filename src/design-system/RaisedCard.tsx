import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle, type GestureResponderEvent } from 'react-native';
import { colors, elevation, radii } from './tokens';
import { SurfaceWash } from './SurfaceWash';
import { AnimatedPressable } from './AnimatedPressable';
import type { TiltVariant } from './useTiltPress';

// The reusable "3D-feeling raised/floating card" the brief calls for: a base
// for activity cards and other content tiles, generalizing HomeScreen's
// Pressable/cardFace/cardClip/CardBackground structure (perspective tilt +
// lift + scale on press, a colored two-tone wash, a border, and a soft
// elevated shadow) into one component any future screen's redesign can
// reuse instead of copy-pasting that structure a fifth time.
//
// Built on top of AnimatedPressable (this file's own tilt/lift/scale
// primitive) rather than re-deriving the same Animated wiring, and mirrors
// HomeScreen's exact 3-layer split and the reasoning behind it:
//   - the outer Pressable carries layout/hit-area only, never animated
//   - `cardFace` (the tilting Animated.View) carries the transform + border
//     + shadow, WITHOUT overflow:'hidden' — on iOS, overflow:'hidden' on the
//     same view as a shadow clips the shadow away too
//   - `cardClip` (one level deeper, plain — never animated) carries
//     overflow:'hidden' for the wash and content to respect the rounded
//     corners
//
// When no `onPress` is given, this renders as a static (non-interactive)
// raised panel instead — same visual treatment, just without a Pressable or
// any tilt wiring, for content tiles that aren't tappable.
export function RaisedCard({
  children,
  color = colors.surface,
  borderColor,
  onPress,
  onLongPress,
  disabled,
  selected,
  tilt = 'regular',
  elevationLevel = 'level3',
  style,
  testID,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  // Fill color for the card face — combined with a light-over-dark
  // SurfaceWash on top of it, same as HomeScreen's colored activity cards.
  color?: string;
  borderColor?: string;
  onPress?: (event: GestureResponderEvent) => void;
  // Optional long-press (e.g. a gallery's "enter multi-select mode")  —
  // only meaningful alongside onPress, since the static (no-onPress) panel
  // path below isn't a Pressable at all.
  onLongPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  // Optional "selected" accessibility state, e.g. a gallery tile checked
  // during long-press multi-select — only meaningful alongside onPress,
  // for the same reason as onLongPress above (the static panel path isn't
  // a Pressable, so it has no accessibilityState at all).
  selected?: boolean;
  tilt?: TiltVariant;
  elevationLevel?: keyof typeof elevation;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const face = (
    <View style={[styles.cardClip, { backgroundColor: color }]}>
      <SurfaceWash />
      {children}
    </View>
  );

  if (!onPress) {
    return (
      <View testID={testID} style={style} accessibilityLabel={accessibilityLabel}>
        <View style={[styles.cardFace, { borderColor: borderColor ?? color }, elevation[elevationLevel]]}>{face}</View>
      </View>
    );
  }

  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      selected={selected}
      tilt={tilt}
      style={style}
      accessibilityLabel={accessibilityLabel}
      innerStyle={[styles.cardFace, { borderColor: borderColor ?? color }, elevation[elevationLevel]]}
    >
      {face}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  cardFace: {
    flex: 1,
    borderRadius: radii.xl,
    borderWidth: 4,
  },
  cardClip: {
    flex: 1,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
});
