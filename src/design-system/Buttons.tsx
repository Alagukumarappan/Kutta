import React from 'react';
import { Animated, StyleSheet, type StyleProp, type ViewStyle, type GestureResponderEvent } from 'react-native';
import { Button as PaperButton } from 'react-native-paper';
import { colors, elevation, radii, spacing, touchTarget, typography } from './tokens';
import { useTiltPress } from './useTiltPress';

// The "raised primary/secondary button" pair the brief calls for. Built on
// react-native-paper's own <Button> — per this iteration's guidance to use
// Paper where it genuinely helps (here: Material ripple feedback,
// accessibility state handling, and theming already wired up via
// PaperProvider/paperTheme) rather than reinventing a button from a bare
// Pressable — with one addition Paper's flat MD3 buttons don't provide on
// their own: the same press-in "lift and settle" depth feedback used
// elsewhere in this design system (via useTiltPress), plus an explicit
// raised drop shadow so the button reads as a physical, raised object
// rather than a flat tinted rectangle.
//
// Deliberately just scale + lift here (no rotateX/Y) — full 3D tilt suits a
// large, roomy card tapped near its center; a button is a small, precise
// target a child taps, and a big rotation would make its label distractingly
// swim right when reading the result of the tap matters most.
function RaisedButtonBase({
  label,
  onPress,
  onLongPress,
  disabled,
  mode,
  color,
  textColor,
  icon,
  size = 'large',
  style,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  mode: 'contained' | 'outlined';
  color: string;
  textColor: string;
  icon?: string;
  size?: 'large' | 'compact';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { style: tiltStyle, onPressIn, onPressOut, reset } = useTiltPress('compact');

  React.useEffect(() => {
    if (disabled) reset();
  }, [disabled, reset]);

  const minHeight = size === 'large' ? touchTarget.primaryCTA : touchTarget.minimum;

  return (
    <Animated.View
      style={[
        styles.shadowWrapper,
        !disabled && elevation.level3,
        { borderRadius: radii.pill },
        tiltStyle,
        style,
      ]}
    >
      <PaperButton
        testID={testID}
        mode={mode}
        icon={icon}
        onPress={disabled ? undefined : onPress}
        onLongPress={disabled ? undefined : onLongPress}
        onPressIn={disabled ? undefined : onPressIn}
        onPressOut={disabled ? undefined : onPressOut}
        disabled={disabled}
        buttonColor={mode === 'contained' ? color : undefined}
        textColor={mode === 'contained' ? textColor : color}
        style={[styles.button, mode === 'outlined' && { borderColor: color, borderWidth: 2 }]}
        contentStyle={{ minHeight, paddingHorizontal: spacing.md }}
        labelStyle={size === 'large' ? styles.labelLarge : styles.labelCompact}
        accessibilityLabel={accessibilityLabel ?? label}
      >
        {label}
      </PaperButton>
    </Animated.View>
  );
}

export function RaisedPrimaryButton(
  props: Omit<React.ComponentProps<typeof RaisedButtonBase>, 'mode' | 'color' | 'textColor'> & {
    color?: string;
    textColor?: string;
  }
) {
  return (
    <RaisedButtonBase
      {...props}
      mode="contained"
      color={props.color ?? colors.bubblegum}
      textColor={props.textColor ?? colors.white}
    />
  );
}

export function RaisedSecondaryButton(
  props: Omit<React.ComponentProps<typeof RaisedButtonBase>, 'mode' | 'color' | 'textColor'> & {
    color?: string;
    textColor?: string;
  }
) {
  return (
    <RaisedButtonBase
      {...props}
      mode="outlined"
      color={props.color ?? colors.violet}
      textColor={props.textColor ?? colors.violet}
    />
  );
}

const styles = StyleSheet.create({
  shadowWrapper: {
    shadowColor: elevation.level3.shadowColor,
    alignSelf: 'flex-start',
  },
  button: {
    borderRadius: radii.pill,
  },
  labelLarge: {
    fontSize: typography.button.fontSize,
    fontWeight: typography.button.fontWeight,
    letterSpacing: typography.button.letterSpacing,
  },
  labelCompact: {
    fontSize: typography.buttonSmall.fontSize,
    fontWeight: typography.buttonSmall.fontWeight,
    letterSpacing: typography.buttonSmall.letterSpacing,
  },
});
