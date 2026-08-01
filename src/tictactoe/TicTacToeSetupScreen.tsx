import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import type { Difficulty } from './ticTacToeEngine';
import {
  colors,
  radii,
  spacing,
  typography,
  elevation,
  touchTarget,
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
  // friendName is only passed (and only meaningful) for 'friend' mode — a
  // real name to show instead of a generic "Player X"/"Friend" label once
  // the game starts (see TicTacToeScreen's own statusText).
  onStart: (mode: TicTacToeMode, difficulty: Difficulty | null, friendName?: string) => void;
}) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<TicTacToeMode | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [friendName, setFriendName] = useState('');
  const trimmedFriendName = friendName.trim();

  const canStart =
    (mode === 'friend' && trimmedFriendName.length > 0) || (mode === 'computer' && difficulty !== null);
  // Same time-based re-arm guard as HomeScreen's own navLockRef: this
  // screen stays mounted (not unmounted) underneath 'tictactoe-game' when
  // navigation.navigate pushes it, so a rapid double-tap on Start — before
  // React Navigation's push has visually taken over — could otherwise fire
  // onStart/navigate twice, pushing the game screen onto the stack twice.
  // A permanent one-shot ref would work for that immediate double-tap but
  // would also permanently disable Start if the parent backs out and wants
  // to legitimately start again, so this re-arms after a short delay
  // instead, exactly like HomeScreen's cards.
  const navLockRef = useRef(false);
  const rearmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (rearmTimeoutRef.current) clearTimeout(rearmTimeoutRef.current);
    };
  }, []);

  function handleStart() {
    if (!canStart || !mode || navLockRef.current) return;
    navLockRef.current = true;
    onStart(mode, mode === 'computer' ? difficulty : null, mode === 'friend' ? trimmedFriendName : undefined);
    rearmTimeoutRef.current = setTimeout(() => {
      navLockRef.current = false;
    }, 800);
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

      {mode === 'friend' && (
        // Lets the game greet both players by name once it starts (see
        // TicTacToeScreen's statusText) instead of the generic "Player X"/
        // "Friend" wording — the child's own name already comes from their
        // profile (set during onboarding), so only the friend's name needs
        // asking for here.
        <View style={styles.friendNameRow}>
          <Text style={styles.stepLabel}>{t('tictactoeFriendNamePrompt')}</Text>
          <TextInput
            testID="tictactoe-friend-name-input"
            value={friendName}
            onChangeText={setFriendName}
            style={[styles.friendNameInput, trimmedFriendName.length > 0 && styles.friendNameInputFilled]}
            placeholder={t('tictactoeFriendNamePlaceholder')}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t('tictactoeFriendNamePrompt')}
          />
        </View>
      )}

      <View style={styles.startWrapper}>
        <RaisedPrimaryButton
          testID="tictactoe-start-game"
          label={t('tictactoeStartGame')}
          onPress={handleStart}
          disabled={!canStart}
          color={PALETTE.accent}
          size="compact"
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
    // Deliberately NOT a ScrollView: this screen's total content (title +
    // both option rows + Start) is small and fixed (never grows with user
    // data, unlike a gallery), so once every element below is sized to fit
    // even a short landscape-locked phone screen, scrolling would only add
    // an extra gesture for no benefit. See the compacted sizes below —
    // previously this screen used a much larger scale (h1 title, 120dp
    // option cards, a full-size 64dp Start button) that could push the
    // difficulty row and Start button off-screen with no way to reach them
    // on a shorter viewport (a real, reported bug, not hypothetical).
    justifyContent: 'center',
  },
  brandEmoji: {
    fontSize: 22,
  },
  title: {
    fontSize: typography.h2.fontSize,
    fontWeight: typography.h2.fontWeight,
    color: colors.ink,
    marginTop: spacing.xxs,
    marginBottom: spacing.sm,
  },
  stepLabel: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
    color: colors.inkMuted,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  optionOuter: {
    width: 112,
    height: 88,
  },
  optionCard: {
    flex: 1,
    borderRadius: radii.lg,
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
    fontSize: 26,
    marginBottom: spacing.xxs,
  },
  optionText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '800',
    color: colors.ink,
  },
  optionTextSelected: {
    color: PALETTE.accentDark,
  },
  difficultyOuter: {
    // Width is comfortably above the 48dp minimum tap target guideline —
    // height is exactly touchTarget.minimum (see below), the floor this
    // app treats as non-negotiable for accessibility even while shrinking
    // everything else to fit the screen.
    width: 80,
    height: touchTarget.minimum,
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
    fontSize: typography.caption.fontSize,
    fontWeight: '800',
    color: colors.ink,
  },
  difficultyTextSelected: {
    color: colors.white,
  },
  friendNameRow: {
    alignItems: 'center',
  },
  friendNameInput: {
    width: 200,
    minHeight: touchTarget.minimum,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
    color: colors.ink,
    textAlign: 'center',
  },
  friendNameInputFilled: {
    borderColor: PALETTE.accentDark,
  },
  startWrapper: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  startButton: {
    minWidth: 200,
  },
});
