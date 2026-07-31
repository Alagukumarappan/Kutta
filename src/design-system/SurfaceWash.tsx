import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, surfaceWash } from './tokens';

// Generalizes the "fake a soft diagonal light source on a flat color" trick
// HomeScreen's CardBackground, QuestionRenderer's questionCard/feedbackCard,
// and PuzzleScreen/ColoringScreen's own card washes each reimplemented with
// slightly different hand-picked opacities: two overlapping, absolutely
// positioned, semi-transparent Views — a light wash over the top ~55%, a
// dark wash under the bottom ~45% — layered over a flat base color. Still no
// gradient library involved (none is installed, and this is purely a still,
// four-corner-static wash, not worth adding a Skia <Canvas> / linear-gradient
// dependency for — same reasoning HomeScreen's own CardBackground comment
// already spelled out).
export function SurfaceWash({ tint = colors.white, shade = colors.ink }: { tint?: string; shade?: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.highlight, { backgroundColor: tint }]} />
      <View style={[styles.shadow, { backgroundColor: shade }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: surfaceWash.highlightHeightPct,
    opacity: surfaceWash.highlightOpacity,
  },
  shadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: surfaceWash.shadowHeightPct,
    opacity: surfaceWash.shadowOpacity,
  },
});
