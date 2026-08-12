import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { PAIR_COUNTS, type PairCount } from './memoryMatchEngine';
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
  GradientScreenBackground,
  withAlpha,
} from '../design-system';

export type MemoryMatchMode = 'solo' | 'friend';

const PALETTE = getActivityPalette('memoryMatch');

// Same cap/reasoning as TicTacToeSetupScreen's own FRIEND_NAME_MAX_LENGTH:
// this name is rendered centered and unbounded later (the score chip and
// turn indicator on MemoryMatchScreen), so an arbitrarily long name could
// wrap awkwardly on a short, landscape-locked phone screen.
const FRIEND_NAME_MAX_LENGTH = 20;

// Asks "who's playing" (solo or a friend sharing the device) and "how many
// pairs", then hands MemoryMatchScreen an already-fully-decided
// { mode, pairCount, friendName? } -- same staged-screen shape as
// TicTacToeSetupScreen, so the game screen itself never has to re-ask or
// re-derive anything mid-game.
export function MemoryMatchSetupScreen({
  onStart,
}: {
  onStart: (mode: MemoryMatchMode, pairCount: PairCount, friendName?: string) => void;
}) {
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<MemoryMatchMode | null>(null);
  const [pairCount, setPairCount] = useState<PairCount | null>(null);
  const [friendName, setFriendName] = useState('');
  const trimmedFriendName = friendName.trim();

  function handleFriendNameChange(text: string) {
    setFriendName(text.slice(0, FRIEND_NAME_MAX_LENGTH));
  }

  const canStart =
    pairCount !== null && (mode === 'solo' || (mode === 'friend' && trimmedFriendName.length > 0));

  // Same re-armable double-tap guard as TicTacToeSetupScreen's own
  // navLockRef -- this screen stays mounted underneath the pushed game
  // screen (React Navigation's native stack), so a rapid double-tap on
  // Start could otherwise fire onStart twice before the push visually
  // takes over.
  const navLockRef = useRef(false);
  const rearmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (rearmTimeoutRef.current) clearTimeout(rearmTimeoutRef.current);
    };
  }, []);

  function handleStart() {
    if (!canStart || !mode || pairCount === null || navLockRef.current) return;
    navLockRef.current = true;
    onStart(mode, pairCount, mode === 'friend' ? trimmedFriendName : undefined);
    rearmTimeoutRef.current = setTimeout(() => {
      navLockRef.current = false;
    }, 800);
  }

  return (
    <GradientScreenBackground>
      {/* ScrollView as a keyboard safety net, same reasoning as
          TicTacToeSetupScreen's own: picking "Friend" reveals a text
          field, and this app is landscape-locked, where the keyboard eats
          well over half the window height. */}
      <ScrollView
        testID="memory-match-setup-scroll-view"
        style={styles.scrollView}
        contentContainerStyle={[
          styles.screen,
          {
            paddingTop: spacing.md + insets.top,
            paddingBottom: spacing.md + insets.bottom,
            paddingLeft: spacing.md + insets.left,
            paddingRight: spacing.md + insets.right,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.brandEmoji}>🃏</Text>
        <Text style={styles.title}>{t('memoryMatchSetupTitle')}</Text>

        <Text style={styles.stepLabel}>{t('memoryMatchChoosePlayers')}</Text>
        <View style={styles.optionRow}>
          <AnimatedPressable
            testID="memory-match-mode-solo"
            onPress={() => setMode('solo')}
            tilt="regular"
            style={styles.optionOuter}
            innerStyle={[styles.optionCard, mode === 'solo' && styles.optionCardSelected]}
            accessibilityRole="button"
            accessibilityLabel={t('memoryMatchModeSolo')}
            selected={mode === 'solo'}
          >
            <Text style={styles.optionEmoji}>🧑</Text>
            <Text style={[styles.optionText, mode === 'solo' && styles.optionTextSelected]}>
              {t('memoryMatchModeSolo')}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            testID="memory-match-mode-friend"
            onPress={() => setMode('friend')}
            tilt="regular"
            style={styles.optionOuter}
            innerStyle={[styles.optionCard, mode === 'friend' && styles.optionCardSelected]}
            accessibilityRole="button"
            accessibilityLabel={t('memoryMatchModeFriend')}
            selected={mode === 'friend'}
          >
            <Text style={styles.optionEmoji}>🧑‍🤝‍🧑</Text>
            <Text style={[styles.optionText, mode === 'friend' && styles.optionTextSelected]}>
              {t('memoryMatchModeFriend')}
            </Text>
          </AnimatedPressable>
        </View>

        {mode === 'friend' && (
          <View style={styles.friendNameRow}>
            <Text style={styles.stepLabel}>{t('memoryMatchFriendNamePrompt')}</Text>
            <TextInput
              mode="outlined"
              dense
              label={t('memoryMatchFriendNamePlaceholder')}
              testID="memory-match-friend-name-input"
              value={friendName}
              onChangeText={handleFriendNameChange}
              maxLength={FRIEND_NAME_MAX_LENGTH}
              outlineColor={trimmedFriendName.length > 0 ? PALETTE.accentDark : colors.line}
              activeOutlineColor={PALETTE.accentDark}
              style={[styles.friendNameInput, trimmedFriendName.length > 0 && styles.friendNameInputFilled]}
              contentStyle={styles.friendNameInputContent}
              accessibilityLabel={t('memoryMatchFriendNamePrompt')}
            />
          </View>
        )}

        <Text style={styles.stepLabel}>{t('memoryMatchChooseDifficulty')}</Text>
        <View style={styles.optionRow}>
          {PAIR_COUNTS.map((count) => (
            <AnimatedPressable
              key={count}
              testID={`memory-match-difficulty-${count}`}
              onPress={() => setPairCount(count)}
              tilt="compact"
              style={styles.difficultyOuter}
              innerStyle={[styles.difficultyPill, pairCount === count && styles.difficultyPillSelected]}
              accessibilityRole="button"
              accessibilityLabel={tFormat('memoryMatchPairs', language, { count })}
              selected={pairCount === count}
            >
              <Text style={[styles.difficultyText, pairCount === count && styles.difficultyTextSelected]}>
                {count}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        <View style={styles.startWrapper}>
          <RaisedPrimaryButton
            testID="memory-match-start-game"
            label={t('memoryMatchStartGame')}
            onPress={handleStart}
            disabled={!canStart}
            color={PALETTE.accent}
            textColor={PALETTE.onAccentText}
            size="compact"
            style={styles.startButton}
          />
        </View>
      </ScrollView>
    </GradientScreenBackground>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  screen: {
    flexGrow: 1,
    alignItems: 'center',
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
    color: withAlpha(colors.ink, 0.9),
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
    width: 64,
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
    color: colors.ink,
  },
  friendNameRow: {
    alignItems: 'center',
  },
  friendNameInput: {
    width: 200,
    backgroundColor: colors.surface,
  },
  friendNameInputContent: {
    textAlign: 'center',
  },
  friendNameInputFilled: {
    backgroundColor: colors.surface,
  },
  startWrapper: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  startButton: {
    minWidth: 200,
  },
});
