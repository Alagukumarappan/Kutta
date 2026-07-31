import type { StringKey } from '../i18n/strings';

export type RGBA = [number, number, number, number];

export interface PaletteColor {
  // Display color used to render the swatch itself (any RN color string).
  display: string;
  // RGBA fill color passed to floodFill / used as the pen stroke color.
  fill: RGBA;
  // i18n key naming this color for screen readers (e.g. accessibilityLabel).
  // Additive field — does not change the meaning of `display`/`fill`.
  nameKey: StringKey;
}

// A crayon-box-style palette: vivid, distinct hues appropriate for a kids'
// coloring app rather than muted/pastel tones.
export const PALETTE: PaletteColor[] = [
  { display: '#E63946', fill: [230, 57, 70, 255], nameKey: 'paletteColorRed' }, // red
  { display: '#FF8C00', fill: [255, 140, 0, 255], nameKey: 'paletteColorOrange' }, // orange
  { display: '#FFD500', fill: [255, 213, 0, 255], nameKey: 'paletteColorYellow' }, // yellow
  { display: '#2ECC71', fill: [46, 204, 113, 255], nameKey: 'paletteColorGreen' }, // green
  { display: '#1E90FF', fill: [30, 144, 255, 255], nameKey: 'paletteColorBlue' }, // blue
  { display: '#8E44AD', fill: [142, 68, 173, 255], nameKey: 'paletteColorPurple' }, // purple
  { display: '#FF69B4', fill: [255, 105, 180, 255], nameKey: 'paletteColorPink' }, // pink
  { display: '#8B5A2B', fill: [139, 90, 43, 255], nameKey: 'paletteColorBrown' }, // brown
  { display: '#000000', fill: [0, 0, 0, 255], nameKey: 'paletteColorBlack' }, // black
  { display: '#FFFFFF', fill: [255, 255, 255, 255], nameKey: 'paletteColorWhite' }, // white
  { display: '#009688', fill: [0, 150, 136, 255], nameKey: 'paletteColorTeal' }, // teal
  { display: '#808080', fill: [128, 128, 128, 255], nameKey: 'paletteColorGray' }, // gray

  // --- Added iteration 25: closing genuine gaps against the spec's
  // exhaustive category list (basic/light/dark/warm/cool/skin-tone-
  // friendly/neutral). Basic/warm/cool/neutral were already covered by the
  // 12 colors above; light, dark, and skin-tone-friendly were not — every
  // one of the original 12 is either a vivid mid-saturation hue or a pure
  // black/white/gray neutral, with no pastel, no dark-beyond-black, and no
  // skin tone at all. Kept deliberately small (5 new colors, not a full
  // light/dark ramp of every hue) to avoid an unwieldy swatch row.
  { display: '#AEE2FF', fill: [174, 226, 255, 255], nameKey: 'paletteColorLightBlue' }, // light blue (pastel)
  { display: '#1B2A4A', fill: [27, 42, 74, 255], nameKey: 'paletteColorNavy' }, // navy (dark)
  { display: '#FFDBAC', fill: [255, 219, 172, 255], nameKey: 'paletteColorSkinLight' }, // light skin tone
  { display: '#C68642', fill: [198, 134, 66, 255], nameKey: 'paletteColorSkinMedium' }, // medium skin tone
  { display: '#6B4226', fill: [107, 66, 38, 255], nameKey: 'paletteColorSkinDeep' }, // deep skin tone
];
