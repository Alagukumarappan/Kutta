import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
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

  // Landscape gives ample width and limited height, so the 4 cards sit in a
  // single row instead of a 2x2 stack. Size them from the actual window
  // rather than a fixed pixel size, and cap the height so the row never
  // outgrows a short screen (leaving room for the header above it).
  const gap = spacing.md;
  const cardWidth = (width - spacing.md * 2 - gap * (CARDS.length - 1)) / CARDS.length;
  const headerReserve = 140;
  const cardHeight = clamp(height - headerReserve, 120, 220);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.greetingBubble}>
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
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  greetingBubble: {
    backgroundColor: colors.sun,
    borderRadius: radii.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    ...shadow,
    elevation: 3,
  },
  greetingText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.ink,
  },
  greetingName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.ink,
  },
  settingsButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    elevation: 3,
  },
  settingsIcon: {
    fontSize: 26,
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
