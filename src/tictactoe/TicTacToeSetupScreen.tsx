import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import type { Difficulty } from './ticTacToeEngine';
import {
  colors,
  radii,
  spacing,
  typography,
  elevation,
  getActivityPalette,
  AnimatedPressable,
  RaisedPrimaryButton,
} from '../design-system';

export type TicTacToeMode = 'computer' | 'friend';

const PALETTE = getActivityPalette('tictactoe');

const DIFFICULTIES: { value: Difficulty; labelKey: 'tictactoeDifficultyEasy' | 'tictactoeDifficultyMedium' | 'tictactoeDifficultyHard' }[] = [
  { value: 'easy', labelKey: 'tictactoeDifficultyEasy' },
  { value: 'medium', labelKey: 'tictactoeDifficultyMedium' },
  { value: 'hard', labelKey: 'tictactoeDifficultyHard' },
];

// Asks "who do you want to play" (computer or a friend sharing the device),
// then — only for computer — "how hard should it be", before starting the
// actual game. Kept as its own staged screen (rather than folded into
// TicTacToeScreen itself) so the board screen only ever deals with an
// already-fully-decided { mode, difficulty } and never has to re-derive or
// re-ask mid-game, mirroring how PuzzleGallery's difficulty dropdown now
// hands PuzzleScreen a decided pieceCount up front (see
// puzzleDifficultyStore.ts's iteration).
export function TicTacToeSetupScreen({
  onStart,
}: {
  onStart: (mode: TicTacToeMode, difficulty: Difficulty | null) => void;
}) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<TicTacToeMode | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);

  const canStart = mode === 'friend' || (mode === 'computer' && difficulty !== null);

  function handleStart() {
    if (!canStart || !mode) return;
    onStart(mode, mode === 'computer' ? difficulty : null);
  }

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
      <Text style={styles.brandEmoji}>⭕❌</Text>
      <Text style={styles.title}>{t('tictactoeSetupTitle')}</Text>

      <Text style={styles.stepLabel}>{t('tictactoeChooseOpponent')}</Text>
      <View style={styles.optionRow}>
        <AnimatedPressable
          testID="tictactoe-opponent-computer"
          onPress={() => setMode('computer')}
          tilt="regular"
          style={styles.optionOuter}
          innerStyle={[styles.optionCard, mode === 'computer' && styles.optionCardSelected]}
          accessibilityRole="button"
          accessibilityLabel={t('tictactoeOpponentComputer')}
        >
          <Text style={styles.optionEmoji}>💻</Text>
          <Text style={[styles.optionText, mode === 'computer' && styles.optionTextSelected]}>
            {t('tictactoeOpponentComputer')}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          testID="tictactoe-opponent-friend"
          onPress={() => setMode('friend')}
          tilt="regular"
          style={styles.optionOuter}
          innerStyle={[styles.optionCard, mode === 'friend' && styles.optionCardSelected]}
          accessibilityRole="button"
          accessibilityLabel={t('tictactoeOpponentFriend')}
        >
          <Text style={styles.optionEmoji}>🧑‍🤝‍🧑</Text>
          <Text style={[styles.optionText, mode === 'friend' && styles.optionTextSelected]}>
            {t('tictactoeOpponentFriend')}
          </Text>
        </AnimatedPressable>
      </View>

      {mode === 'computer' && (
        <>
          <Text style={styles.stepLabel}>{t('tictactoeChooseDifficulty')}</Text>
          <View style={styles.optionRow}>
            {DIFFICULTIES.map((option) => (
              <AnimatedPressable
                key={option.value}
                testID={`tictactoe-difficulty-${option.value}`}
                onPress={() => setDifficulty(option.value)}
                tilt="compact"
                style={styles.difficultyOuter}
                innerStyle={[styles.difficultyPill, difficulty === option.value && styles.difficultyPillSelected]}
                accessibilityRole="button"
                accessibilityLabel={t(option.labelKey)}
              >
                <Text
                  style={[
                    styles.difficultyText,
                    difficulty === option.value && styles.difficultyTextSelected,
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </AnimatedPressable>
            ))}
          </View>
        </>
      )}

      <View style={styles.startWrapper}>
        <RaisedPrimaryButton
          testID="tictactoe-start-game"
          label={t('tictactoeStartGame')}
          onPress={handleStart}
          disabled={!canStart}
          color={PALETTE.accent}
          size="large"
          style={styles.startButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
  },
  brandEmoji: {
    fontSize: 32,
    marginTop: spacing.xs,
  },
  title: {
    fontSize: typography.h1.fontSize,
    fontWeight: typography.h1.fontWeight,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  stepLabel: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.inkMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  optionOuter: {
    width: 140,
    height: 120,
  },
  optionCard: {
    flex: 1,
    borderRadius: radii.xl,
    borderWidth: 3,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.level2,
  },
  optionCardSelected: {
    borderColor: PALETTE.accentDark,
    backgroundColor: PALETTE.accentSoft,
  },
  optionEmoji: {
    fontSize: 36,
    marginBottom: spacing.xs,
  },
  optionText: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: '800',
    color: colors.ink,
  },
  optionTextSelected: {
    color: PALETTE.accentDark,
  },
  difficultyOuter: {
    width: 96,
    height: 56,
  },
  difficultyPill: {
    flex: 1,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  difficultyPillSelected: {
    borderColor: PALETTE.accentDark,
    backgroundColor: PALETTE.accent,
  },
  difficultyText: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: '800',
    color: colors.ink,
  },
  difficultyTextSelected: {
    color: colors.white,
  },
  startWrapper: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  startButton: {
    minWidth: 220,
  },
});
