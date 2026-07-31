import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { loadQuestions } from './loadQuestions';
import { buildSession, initialSessionState, answerCurrentQuestion, QuizSessionState } from './quizSession';
import type { Question } from '../types/quiz';
import { QuestionRenderer } from './QuestionRenderer';
import { colors, radii, spacing, shadow } from '../theme/tokens';

export function QuizScreen({
  quizFolderUri,
  childAge,
  onGoHome,
}: {
  quizFolderUri: string;
  childAge: number;
  // Optional so existing call sites/tests that don't need the Home button
  // (e.g. ones that never reach the finished screen) don't have to pass one.
  // RootNavigator always wires a real one in the running app.
  onGoHome?: () => void;
}) {
  const { t, language } = useLanguage();
  // This screen is shown with headerShown:true (see RootNavigator), so the
  // native header already covers the top inset — only left/right/bottom are
  // ours to handle (relevant in this landscape-only app where a notch or
  // gesture-nav bar sits at one of the sides).
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<QuizSessionState | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  // Bumped on Retry to force a fresh load attempt even when quizFolderUri and
  // childAge haven't changed (e.g. a transient failure).
  const [retryToken, setRetryToken] = useState(0);
  // The full loaded (unfiltered/unshuffled) question pool, kept around so
  // "Play Again" can call buildSession() again — a real fresh shuffle/reselect
  // — without re-reading the quiz folder from disk.
  const allQuestionsRef = useRef<Question[]>([]);

  // Double-fire guards for the two completion-screen buttons (same idiom as
  // this codebase's other in-flight-action guards, e.g. SettingsScreen's
  // `migrating` check): a ref survives across renders and is shared by every
  // closure of this component instance, so even a second press captured from
  // a stale (pre-reset) render can't slip past it. playAgainFiredRef is
  // re-armed whenever a finished screen is freshly entered, so a later
  // "Play Again" (after finishing a subsequent session) still works;
  // hasNavigatedHomeRef never needs to re-arm since navigating home
  // permanently leaves this screen instance.
  const playAgainFiredRef = useRef(false);
  const hasNavigatedHomeRef = useRef(false);

  useEffect(() => {
    if (state?.isFinished) playAgainFiredRef.current = false;
  }, [state?.isFinished]);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setState(null);

    loadQuestions(quizFolderUri)
      .then((all) => {
        if (cancelled) return;
        allQuestionsRef.current = all;
        const session = buildSession(all, childAge);
        setState(initialSessionState(session));
      })
      .catch(() => {
        // The SAF grant may have been revoked, the quiz folder deleted
        // externally, or an SD card unmounted — surface a retry state
        // instead of leaving an unhandled rejection and a permanently blank
        // loading screen.
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [quizFolderUri, childAge, retryToken]);

  const insetStyle = {
    paddingLeft: spacing.lg + insets.left,
    paddingRight: spacing.lg + insets.right,
    paddingBottom: spacing.lg + insets.bottom,
  };

  if (error) {
    return (
      <View testID="quiz-error" style={[styles.centeredScreen, insetStyle]}>
        <Text style={styles.messageText}>{t('loadError')}</Text>
        <Pressable
          testID="quiz-retry"
          onPress={() => setRetryToken((n) => n + 1)}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel={t('retry')}
        >
          <Text style={styles.retryButtonText}>{t('retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (!state) return <View testID="quiz-loading" style={[styles.centeredScreen, insetStyle]} />;

  if (state.session.length === 0) {
    return (
      <View style={[styles.centeredScreen, insetStyle]}>
        <Text style={styles.messageText}>{t('emptyQuiz')}</Text>
      </View>
    );
  }

  if (state.isFinished) {
    const total = state.session.length;
    // 1-3 stars rather than a raw percentage — easier for a young child to
    // read at a glance, and floored at 1 star so even a rough round still
    // feels like an accomplishment rather than a "failure" grade.
    const ratio = total > 0 ? state.score / total : 0;
    const starCount = ratio >= 0.9 ? 3 : ratio >= 0.5 ? 2 : 1;

    function handlePlayAgain() {
      if (playAgainFiredRef.current) return;
      playAgainFiredRef.current = true;
      setSelectedOptionId(null);
      // A genuinely fresh session: a brand-new buildSession() call reshuffles
      // and reselects from the same loaded pool (see quizSession.ts's
      // shuffle-then-slice), not a re-render of the just-finished one.
      const freshSession = buildSession(allQuestionsRef.current, childAge);
      setState(initialSessionState(freshSession));
    }

    function handleGoHome() {
      if (hasNavigatedHomeRef.current) return;
      hasNavigatedHomeRef.current = true;
      onGoHome?.();
    }

    return (
      <View style={[styles.centeredScreen, insetStyle]}>
        <View style={styles.scoreCard}>
          <Text style={styles.scoreEmoji}>🎉</Text>
          <Text style={styles.starsRow}>
            {[1, 2, 3].map((n) => (n <= starCount ? '⭐' : '☆')).join(' ')}
          </Text>
          <Text style={styles.scoreText}>
            {tFormat('quizScore', language, { score: state.score, total })}
          </Text>
        </View>
        <View style={styles.completionActionsRow}>
          <Pressable
            testID="quiz-play-again"
            onPress={handlePlayAgain}
            style={styles.playAgainButton}
            accessibilityRole="button"
            accessibilityLabel={t('quizPlayAgain')}
          >
            <Text style={styles.playAgainButtonText}>{t('quizPlayAgain')}</Text>
          </Pressable>
          <Pressable
            testID="quiz-home"
            onPress={handleGoHome}
            style={styles.homeButton}
            accessibilityRole="button"
            accessibilityLabel={t('quizGoHome')}
          >
            <Text style={styles.homeButtonText}>{t('quizGoHome')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const currentQuestion = state.session[state.currentIndex];

  function handleSelect(optionId: string) {
    setSelectedOptionId(optionId);
  }

  function handleNext() {
    if (selectedOptionId === null) return;
    setState((prev) => (prev ? answerCurrentQuestion(prev, selectedOptionId) : prev));
    setSelectedOptionId(null);
  }

  // "Try Again" after a wrong answer: only clears the local selection so the
  // options re-enable for a fresh pick on the SAME question. This never
  // calls answerCurrentQuestion itself — scoring only ever happens inside
  // handleNext above — so retrying (even rapidly, any number of times)
  // can't award or deduct a point on its own; whatever is selected when Next
  // is eventually pressed is the one and only thing that gets scored for
  // this question.
  function handleRetry() {
    setSelectedOptionId(null);
  }

  return (
    <QuestionRenderer
      question={currentQuestion}
      language={language}
      selectedOptionId={selectedOptionId}
      onSelect={handleSelect}
      onNext={handleNext}
      onRetry={handleRetry}
      currentIndex={state.currentIndex}
      totalQuestions={state.session.length}
      childAge={childAge}
    />
  );
}

const styles = StyleSheet.create({
  centeredScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  messageText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    backgroundColor: colors.coral,
    borderColor: colors.coralDark,
    borderWidth: 2,
    borderRadius: radii.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    ...shadow,
    elevation: 4,
  },
  retryButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.white,
  },
  scoreCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 4,
    borderColor: colors.sunDark,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    elevation: 4,
  },
  scoreEmoji: {
    fontSize: 48,
    marginBottom: spacing.xs,
  },
  starsRow: {
    fontSize: 40,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  scoreText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
  },
  // A row (not a stack) so the two new buttons cost minimal extra vertical
  // space — this screen must never scroll, and landscape width is plentiful.
  completionActionsRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  playAgainButton: {
    minHeight: 48,
    minWidth: 48,
    backgroundColor: colors.mint,
    borderColor: colors.mintDark,
    borderWidth: 2,
    borderRadius: radii.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    elevation: 4,
  },
  playAgainButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
  },
  homeButton: {
    minHeight: 48,
    minWidth: 48,
    backgroundColor: colors.sky,
    borderColor: colors.skyDark,
    borderWidth: 2,
    borderRadius: radii.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    elevation: 4,
  },
  homeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
  },
});
