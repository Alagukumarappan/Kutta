export const colors = {
  background: '#FFF6E9',
  ink: '#2D3142',
  coral: '#FF6B4A',
  coralDark: '#D9492D', // for coral's cartoon-outline border shade
  sky: '#3EC1D3',
  skyDark: '#2A9AAA',
  sun: '#FFD93D',
  sunDark: '#D9AE1F',
  mint: '#6BCB77',
  mintDark: '#4FA85B',
  pink: '#FF8FA3',
  pinkDark: '#D96B7E',
  periwinkle: '#8F87F1',
  periwinkleDark: '#6B62D6',
  orange: '#FFB84C',
  orangeDark: '#D9942E',
  disabledBg: '#E3DDD0',
  disabledBorder: '#C7C0B0',
  disabledText: '#8A8478',
  white: '#FFFFFF',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radii = { md: 16, lg: 24, xl: 28 };

export const shadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.15,
  shadowRadius: 5,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Mirrors react-native-safe-area-context's EdgeInsets shape without importing
// it here, so this file (pure layout math, unit-testable with no RN/device
// dependency) doesn't need to depend on that library directly.
export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ZERO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// Computes a square size (e.g. a canvas or puzzle board) that fits within the
// current window after reserving room for surrounding UI (palettes, previews,
// labels, margins). Landscape phones are short-but-wide, so the height axis is
// usually the binding constraint - this takes whichever axis is tighter.
export function computeResponsiveSquareSize(
  windowWidth: number,
  windowHeight: number,
  reservedHeight: number,
  reservedWidth: number,
  min: number,
  max: number
): number {
  const maxByHeight = windowHeight - reservedHeight;
  const maxByWidth = windowWidth - reservedWidth;
  return clamp(Math.min(maxByHeight, maxByWidth), min, max);
}
