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
];
