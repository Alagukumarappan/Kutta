import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { colors, radii, spacing, shadow, clamp } from '../theme/tokens';

export type HomeDestination = 'coloring' | 'quiz' | 'puzzle' | 'video' | 'settings';

type CardSpec = {
  testID: string;
  destination: HomeDestination;
  labelKey: 'homeColoring' | 'homeQuiz' | 'homePuzzle' | 'homeVideo';
  emoji: string;
  bg: string;
  border: string;
};

// Matches settingsButton's width/height below — pulled out as a constant so
// the headerReserve math in HomeScreen can derive from it instead of
// duplicating (or drifting from) the literal 44 in the stylesheet.
const SETTINGS_BUTTON_SIZE = 44;

const CARDS: CardSpec[] = [
  { testID: 'home-card-coloring', destination: 'coloring', labelKey: 'homeColoring', emoji: '🎨', bg: colors.pink, border: colors.pinkDark },
  { testID: 'home-card-quiz', destination: 'quiz', labelKey: 'homeQuiz', emoji: '🧠', bg: colors.periwinkle, border: colors.periwinkleDark },
  { testID: 'home-card-puzzle', destination: 'puzzle', labelKey: 'homePuzzle', emoji: '🧩', bg: colors.mint, border: colors.mintDark },
  { testID: 'home-card-video', destination: 'video', labelKey: 'homeVideo', emoji: '🎬', bg: colors.orange, border: colors.orangeDark },
];

export function HomeScreen({
  childName,
  onNavigate,
}: {
  childName: string;
  onNavigate: (destination: HomeDestination) => void;
}) {
  const { t } = useLanguage();
  const { width, height } = useWindowDimensions();
  // Home is the one screen with headerShown:false (no native
  // header/navigation chrome doing this for us elsewhere), so it's the only
  // screen that has to account for the status bar / notch / gesture-nav bar
  // on all four sides itself.
  const insets = useSafeAreaInsets();

  // Landscape gives ample width and limited height, so the 4 cards sit in a
  // single row instead of a 2x2 stack. Size them from the actual window
  // rather than a fixed pixel size, and cap the height so the row never
  // outgrows a short screen (leaving room for the header above it).
  const availableWidth = width - insets.left - insets.right;
  const gap = spacing.md;
  const cardWidth = (availableWidth - spacing.md * 2 - gap * (CARDS.length - 1)) / CARDS.length;
  // Chrome above/below the card row: screen's top+bottom padding (spacing.md
  // each) plus the settings-icon row's fixed height (SETTINGS_BUTTON_SIZE)
  // plus its marginBottom (spacing.md) separating it from the card grid.
  const headerReserve = spacing.md * 3 + SETTINGS_BUTTON_SIZE + insets.top + insets.bottom;
  const cardHeight = clamp(height - headerReserve, 120, 220);

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: spacing.md + insets.top,
          paddingBottom: spacing.md + insets.bottom,
          paddingLeft: spacing.md + insets.left,
          paddingRight: spacing.md + insets.right,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.greetingBadge}>
          <Text style={styles.greetingText}>
            Hi, <Text testID="home-child-name" style={styles.greetingName}>{childName}</Text>! 👋
          </Text>
        </View>

        <Pressable testID="home-settings-icon" onPress={() => onNavigate('settings')} style={styles.settingsButton}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {CARDS.map((card) => (
          <Pressable
            key={card.testID}
            testID={card.testID}
            onPress={() => onNavigate(card.destination)}
            style={[
              styles.card,
              { width: cardWidth, height: cardHeight, backgroundColor: card.bg, borderColor: card.border },
            ]}
          >
            <Text style={styles.cardEmoji}>{card.emoji}</Text>
            <Text style={styles.cardLabel}>{t(card.labelKey)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    // Base padding; the actual per-side padding used at render time also
    // adds this screen's safe-area insets (see the inline style override in
    // the component) since this is the one screen with no native header.
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  greetingBadge: {
    backgroundColor: colors.sun,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    ...shadow,
    elevation: 2,
  },
  greetingText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  greetingName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  settingsButton: {
    width: SETTINGS_BUTTON_SIZE,
    height: SETTINGS_BUTTON_SIZE,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    elevation: 3,
  },
  settingsIcon: {
    fontSize: 22,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    ...shadow,
    elevation: 4,
  },
  cardEmoji: {
    fontSize: 52,
    marginBottom: spacing.sm,
  },
  cardLabel: {
    fontSize: 19,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
  },
});
