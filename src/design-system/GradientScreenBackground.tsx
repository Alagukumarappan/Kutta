import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from './tokens';

// Shared sky -> skyDark gradient every child-facing screen now uses as
// its root background, extracted from HomeScreen's own original
// <LinearGradient colors={[colors.violet, colors.violetDark]} start={{x:0,y:0}}
// end={{x:1,y:1}} /> (see HomeScreen.tsx) so the exact colors/direction can't
// silently drift between screens as each one adopts it — every consumer gets
// this one definition instead of re-typing the same colors/start/end props.
// Switched from the original violet/violetDark to sky/skyDark (a bright,
// cheerful blue) per the app-wide re-theme — HomeScreen.tsx keeps its own
// separate inline <LinearGradient> (never migrated onto this shared
// component) and was updated to the same sky/skyDark pair alongside this
// file so the two don't drift apart.
//
// `showDecorativeBlobs` opts into the same soft, low-opacity white circles
// Home uses for "layered depth" over the flat gradient. Kept OPTIONAL (default
// false) rather than always-on: several of the screens below already have
// their own dense foreground content (galleries, game boards, toolbars) with
// far less open background space than Home's card row, so an extra layer of
// decoration would mostly sit unseen behind that content while still costing
// a render — screens are free to turn it on if they have the open space for
// it to actually read as intentional.
export function GradientScreenBackground({
  children,
  style,
  showDecorativeBlobs = false,
  testID,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  showDecorativeBlobs?: boolean;
  // Forwarded straight onto the LinearGradient root so a screen using this
  // in place of its own root View (rather than nesting a plain View inside
  // it) can still be queried by the same testID its tests already expect.
  testID?: string;
}) {
  return (
    <LinearGradient
      testID={testID}
      colors={[colors.sky, colors.skyDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.fill, style]}
    >
      {showDecorativeBlobs && (
        <>
          <View style={styles.decorTopRight} pointerEvents="none" />
          <View style={styles.decorBottomLeft} pointerEvents="none" />
          <View style={styles.decorMid} pointerEvents="none" />
        </>
      )}
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  decorTopRight: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.white,
    opacity: 0.1,
  },
  decorBottomLeft: {
    position: 'absolute',
    bottom: -70,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.white,
    opacity: 0.08,
  },
  decorMid: {
    position: 'absolute',
    top: '30%',
    left: '38%',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.white,
    opacity: 0.06,
  },
});
