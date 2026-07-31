import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { loadQuestions } from './loadQuestions';
import { buildSession, initialSessionState, answerCurrentQuestion, QuizSessionState } from './quizSession';
import type { Question } from '../types/quiz';
import { QuestionRenderer } from './QuestionRenderer';
import { colors, spacing } from '../theme/tokens';
import {
  colors as dsColors,
  spacing as dsSpacing,
  typography,
  motion,
  getActivityPalette,
  useReducedMotion,
  RaisedCard,
  RaisedPrimaryButton,
  RaisedSecondaryButton,
} from '../design-system';

// REDESIGN (matches QuestionRenderer.tsx's iteration 2 pass onto
// src/design-system/): the completion screen (score card + Play Again/Home)
// and, as of the premium-polish pass's error-state consistency fix, the
// error state too, are built on the new design-system foundation — the
// loading/empty states above still intentionally use the OLD
// src/theme/tokens.ts palette, since redesigning those is out of scope for
// a single-purpose iteration (same "one screen/moment at a time" precedent
// QuestionRenderer's own file-header comment set). Both `colors`/`spacing`
// imports (old theme + new design-system) therefore coexist in this file on
// purpose, aliased as `dsColors`/`dsSpacing` to keep every existing
// loading/empty-state usage of the old, unprefixed `colors`/`spacing`
// unambiguous and untouched.
const quizPalette = getActivityPalette('quiz');

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
  // Same guard idiom, but for the in-quiz "Next" button: without it, two
  // taps landing before the first setState's re-render commits both fire
  // handleNext with the SAME (stale) selectedOptionId closure, so React
  // applies two answerCurrentQuestion() updates back-to-back — the second
  // one scores the *next* question (which the child was never shown) using
  // the *previous* question's answer, silently skipping a question and
  // corrupting the score. Re-armed whenever the current question changes
  // (a fresh question means a fresh Next press is legitimate).
  const nextFiredRef = useRef(false);

  useEffect(() => {
    if (state?.isFinished) playAgainFiredRef.current = false;
  }, [state?.isFinished]);

  useEffect(() => {
    nextFiredRef.current = false;
  }, [state?.currentIndex]);

  // Brief pop-in entrance for the completion screen's score card, mirroring
  // QuestionRenderer's own feedbackCard/cardScaleAnim+cardOpacityAnim recipe
  // exactly (same spring/timing config via the shared `motion` tokens) so
  // finishing a quiz feels consistent with answering one. Declared here
  // (above every early return below) per the Rules of Hooks — same reason
  // playAgainFiredRef's own effect already lives up here rather than beside
  // the `state.isFinished` JSX branch further down.
  const scoreCardScaleAnim = useRef(new Animated.Value(0.85)).current;
  const scoreCardOpacityAnim = useRef(new Animated.Value(0)).current;
  // Same OS "reduce motion" check CelebrationOverlay now respects (see
  // src/design-system/useReducedMotion.ts) — this pop-in is a separate,
  // hand-rolled animation (not routed through CelebrationOverlay, see the
  // file-header comment on why the completion screen is built directly),
  // so it needed its own opt-out rather than inheriting one.
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!state?.isFinished) {
      // Reset to the pre-entrance state whenever the completion screen isn't
      // showing, so the NEXT time it appears (a fresh finish, including
      // after Play Again -> a later finish) the pop-in plays again from
      // scratch instead of resuming from wherever it last landed.
      scoreCardScaleAnim.setValue(0.85);
      scoreCardOpacityAnim.setValue(0);
      return;
    }

    // With reduce-motion enabled, skip the bouncy spring entirely — jump
    // straight to the resting scale and fade opacity only (same recipe as
    // CelebrationOverlay's own reduced-motion path).
    let animation: Animated.CompositeAnimation;
    if (reducedMotion) {
      scoreCardScaleAnim.setValue(1);
      animation = Animated.timing(scoreCardOpacityAnim, {
        toValue: 1,
        duration: motion.duration.base,
        useNativeDriver: true,
      });
    } else {
      animation = Animated.parallel([
        Animated.spring(scoreCardScaleAnim, { toValue: 1, useNativeDriver: true, ...motion.spring.popBouncy }),
        Animated.timing(scoreCardOpacityAnim, { toValue: 1, duration: motion.duration.base, useNativeDriver: true }),
      ]);
    }
    animation.start();

    // Mirrors QuestionRenderer's own cleanup: stop (don't leave running) if
    // this screen re-renders away from the finished state (e.g. Play Again)
    // or unmounts mid-animation.
    return () => {
      animation.stop();
    };
  }, [state?.isFinished, reducedMotion, scoreCardScaleAnim, scoreCardOpacityAnim]);

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
    // Restyled onto the shared design-system's error-card shape — the same
    // RaisedCard + RaisedPrimaryButton pattern every other gallery/player's
    // error state already converged on (VideoPlayerScreen, ColoringGallery,
    // PuzzleGallery, VideoGallery), which this screen had been left behind
    // on (see this file's own header comment on why the completion screen
    // moved onto the new foundation first but the loading/error/empty
    // states didn't). Deliberately scoped to just the error state here —
    // the loading/empty branches below are untouched.
    return (
      <View testID="quiz-error" style={[styles.centeredScreen, insetStyle]}>
        <RaisedCard color={dsColors.surface} borderColor={quizPalette.accentDark} elevationLevel="level3" style={styles.errorCardOuter}>
          <View style={styles.errorCardInner}>
            <Text style={styles.errorTitle}>{t('loadError')}</Text>
            <RaisedPrimaryButton
              testID="quiz-retry"
              label={t('retry')}
              onPress={() => setRetryToken((n) => n + 1)}
              color={quizPalette.accent}
              textColor={quizPalette.onAccentText}
              accessibilityLabel={t('retry')}
            />
          </View>
        </RaisedCard>
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
    // A small decorative badge on top of the existing star row, reflecting
    // the score tier — every tier still gets a warm, celebratory emoji
    // (never a neutral/negative one), so this can't read as shaming even at
    // the lowest 1-star tier. Reuses only existing emoji, no new assets.
    const badgeEmoji = starCount === 3 ? '🏆' : starCount === 2 ? '🌟' : '🎉';

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
        <Animated.View
          style={[
            styles.scoreCardEntrance,
            { opacity: scoreCardOpacityAnim, transform: [{ scale: scoreCardScaleAnim }] },
          ]}
        >
          {/* RaisedCard (design-system) rather than a hand-built bordered
              View: unlike QuestionRenderer's questionCard/feedbackCard, this
              completion panel doesn't need to fill an exact flex-ratio share
              of the screen (see QuestionRenderer's own top-of-file comment on
              why IT can't use RaisedCard) — it's simply centered, so
              RaisedCard's static (no-onPress) panel shape fits directly. */}
          <RaisedCard
            testID="quiz-score-card"
            borderColor={quizPalette.accentDark}
            elevationLevel="level5"
            style={styles.scoreCard}
          >
            <View style={styles.scoreCardContent}>
              <Text style={styles.scoreBadgeEmoji}>{badgeEmoji}</Text>
              <Text style={styles.starsRow}>
                {[1, 2, 3].map((n) => (n <= starCount ? '⭐' : '☆')).join(' ')}
              </Text>
              <Text style={styles.scoreText}>
                {tFormat('quizScore', language, { score: state.score, total })}
              </Text>
            </View>
          </RaisedCard>
        </Animated.View>
        <View style={styles.completionActionsRow}>
          {/* Filled/jade "forward" action vs. outlined/violet "leave" action —
              the same filled-vs-outlined + color-role distinction
              QuestionRenderer's own Next/Retry pair already established —
              rather than two same-shaped buttons differing only by label. */}
          <RaisedPrimaryButton
            testID="quiz-play-again"
            label={t('quizPlayAgain')}
            onPress={handlePlayAgain}
            size="large"
            color={dsColors.jade}
            accessibilityLabel={t('quizPlayAgain')}
          />
          <RaisedSecondaryButton
            testID="quiz-home"
            label={t('quizGoHome')}
            onPress={handleGoHome}
            size="large"
            color={quizPalette.accent}
            accessibilityLabel={t('quizGoHome')}
          />
        </View>
      </View>
    );
  }

  const currentQuestion = state.session[state.currentIndex];

  function handleSelect(optionId: string) {
    setSelectedOptionId(optionId);
  }

  function handleNext() {
    if (selectedOptionId === null || nextFiredRef.current) return;
    nextFiredRef.current = true;
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
  errorCardOuter: {
    width: '100%',
    maxWidth: 420,
  },
  errorCardInner: {
    alignItems: 'center',
    paddingVertical: dsSpacing.lg,
    paddingHorizontal: dsSpacing.xl,
  },
  errorTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: dsColors.ink,
    textAlign: 'center',
    marginBottom: dsSpacing.md,
  },
  // Wraps RaisedCard purely to carry the entrance opacity/scale transform —
  // RaisedCard's own static-panel path renders a plain (non-Animated) View,
  // so the pop-in has to live one level up on a real Animated.View instead.
  scoreCardEntrance: {
    alignItems: 'center',
  },
  scoreCard: {
    minWidth: 280,
  },
  // RaisedCard's own cardClip carries no padding by default (content is
  // free to size itself) — this inner wrapper supplies it, plus the
  // vertical stack of badge/stars/score-text.
  scoreCardContent: {
    paddingVertical: dsSpacing.xl,
    paddingHorizontal: dsSpacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBadgeEmoji: {
    fontSize: 48,
    marginBottom: dsSpacing.xs,
  },
  starsRow: {
    fontSize: 40,
    marginBottom: dsSpacing.sm,
    textAlign: 'center',
  },
  scoreText: {
    fontSize: typography.h2.fontSize,
    fontWeight: typography.h2.fontWeight,
    color: dsColors.ink,
    textAlign: 'center',
  },
  // A row (not a stack) so the two new buttons cost minimal extra vertical
  // space — this screen must never scroll, and landscape width is plentiful.
  completionActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: dsSpacing.lg,
    columnGap: dsSpacing.md,
  },
});
