import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, ScrollView, Animated } from 'react-native';
import type { Question } from '../types/quiz';
import type { Language } from '../types/profile';
import { t, tFormat } from '../i18n/strings';
import { colors, radii, spacing, shadow } from '../theme/tokens';

// This screen rebuilds the quiz UI as a single-question, STACKED layout
// (progress row on top, question card, then a 2x2 answer grid below it,
// then a feedback/Next footer) rather than the old side-by-side
// question-left/options-right split.
//
// Two prior rounds of bugs here came from hand-summing exact pixel budgets
// (padding + border + font-size arithmetic that has to add up exactly
// against the real rendered styles) in a separate ./layout.ts module. This
// version deliberately has NO such module: every section below is sized with
// flexbox ratios (flex: N on siblings inside a flex:1 column) so the
// available height is divided proportionally by Yoga at render time, using
// whatever space the device actually has, instead of a number this file
// has to predict in advance. The progress row and the feedback/Next footer
// are NOT given a flex share — they're auto-sized to their own content,
// and the flexed question/grid sections simply receive whatever height is
// left over, which Yoga computes correctly without this file doing the sum.
//
// The one place a component still needs *some* numeric sizing is the images
// (RN's <Image> doesn't size itself from content) - those use
// aspectRatio: 1 + resizeMode="contain" inside a flex-sized box instead of a
// pixel value computed here, so they simply fill whatever square-ish space
// their flex parent ends up with.
//
// The 2x2 answer grid is built from two EXPLICIT row <View>s (not
// flexWrap:'wrap') for the same reason the Photo Puzzle screen was fixed the
// same way: flexWrap decides where to break a row using float-precision
// comparisons, and fractional dp values (routine on real devices) can cause
// an early/late wrap. An explicit "exactly 2 per row" structure can't wrap
// unpredictably because there is no wrapping decision to make.

function ImageWithFallback({
  uri,
  testID,
  style,
  fallbackIconSize = 32,
}: {
  uri: string;
  testID: string;
  style: object;
  fallbackIconSize?: number;
}) {
  const [failed, setFailed] = React.useState(false);

  if (failed) {
    return (
      <View testID={`${testID}-broken`} style={[styles.imageFallback, style]}>
        <Text style={{ fontSize: fallbackIconSize }}>🖼️</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      testID={testID}
      onError={() => setFailed(true)}
      style={[styles.image, style]}
      resizeMode="contain"
    />
  );
}

export function QuestionRenderer({
  question,
  language,
  selectedOptionId,
  onSelect,
  onNext,
  onRetry,
  currentIndex,
  totalQuestions,
  childAge,
}: {
  question: Question;
  language: Language;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  onNext: () => void;
  // Called when the child taps "Try Again" after a wrong answer. Expected to
  // clear the parent's selectedOptionId (see QuizScreen.handleRetry) so the
  // options re-enable and the child can pick again on the SAME question —
  // this never itself scores anything; only onNext ever does that, so a
  // retry can never cause a duplicate/extra score for one question.
  onRetry?: () => void;
  // Optional: when provided, a row of progress dots is shown above the
  // question so a pre-reader can see how far through the session they are
  // without needing to parse numbers/text. currentIndex is 0-based.
  currentIndex?: number;
  totalQuestions?: number;
  // The active child's profile age (2-8), used only to pick the
  // age-appropriate wrong-answer wording tier below. Optional and defaults
  // to the older (5-8) tier so existing/other call sites that don't pass it
  // still get sensible, non-crashing wording.
  childAge?: number;
}) {
  const hasAnswered = selectedOptionId !== null;
  const isCorrect = hasAnswered && selectedOptionId === question.correctOptionId;
  // Ages 2-4 get the gentlest, simplest phrasing; 5-8 gets a slightly more
  // capable-sounding nudge. See quizIncorrectYoung/quizIncorrectOlder in
  // src/i18n/strings.ts for the actual wording in both languages.
  const incorrectTextKey = typeof childAge === 'number' && childAge <= 4 ? 'quizIncorrectYoung' : 'quizIncorrectOlder';

  // Brief, non-blocking "correct answer" celebration: a pop-in/fade-out
  // bubble that plays alongside (never in front of, and never gating) the
  // existing feedback banner + Next button below. Built with RN's built-in
  // Animated API only — react-native-reanimated is listed in package.json
  // but is wired into neither babel.config.js nor used anywhere in this
  // app today, and adding that wiring is a separate, riskier change than
  // this iteration's scope, so Animated (bundled with react-native, no new
  // dependency) is used instead.
  //
  // The effect below only re-runs when `isCorrect` flips from false to
  // true. Combined with renderOption's existing `!hasAnswered` guard on
  // onSelect (a few lines below), one answer can never (a) score twice or
  // (b) replay/stack this celebration twice, even under rapid/repeated
  // tapping on an option.
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;
  const [showCelebration, setShowCelebration] = React.useState(false);
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!isCorrect) {
      setShowCelebration(false);
      return;
    }

    setShowCelebration(true);
    scaleAnim.setValue(0);
    opacityAnim.setValue(0);

    // Bounded, non-flashing sequence: pop in (~200ms), hold briefly
    // (900ms), then fade out (300ms) — well under a couple of seconds
    // total, so it always auto-resolves on its own.
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(900),
      Animated.timing(opacityAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);

    animation.start(({ finished }) => {
      if (finished && isMountedRef.current) setShowCelebration(false);
    });

    // Stop the animation (cancelling any pending step/callback) if the
    // question changes, the child navigates away, or this component
    // unmounts mid-celebration — no leaked timers/handles.
    return () => {
      animation.stop();
    };
    // question.id is included defensively (not just `isCorrect`): today
    // QuizScreen always resets selectedOptionId to null before advancing to
    // the next question, so isCorrect already cycles true -> false -> ...
    // on every question change — but keying the effect on the question too
    // means this can't silently start replaying a stale celebration even if
    // that reset contract ever changes elsewhere.
  }, [isCorrect, question.id, scaleAnim, opacityAnim]);

  const showProgress = typeof currentIndex === 'number' && typeof totalQuestions === 'number' && totalQuestions > 0;

  const rows: [ [typeof question.options[number], typeof question.options[number]], [typeof question.options[number], typeof question.options[number]] ] = [
    [question.options[0], question.options[1]],
    [question.options[2], question.options[3]],
  ];

  function renderOption(option: Question['options'][number]) {
    const isCorrectOption = option.id === question.correctOptionId;
    const isSelectedOption = option.id === selectedOptionId;
    // Once answered: highlight the correct option green, and — if the child
    // picked a wrong one — highlight their (wrong) pick red too, so the
    // feedback is visible directly on the options, not just in the footer.
    const highlight = hasAnswered ? (isCorrectOption ? 'correct' : isSelectedOption ? 'incorrect' : null) : null;

    return (
      <Pressable
        key={option.id}
        testID={`option-${option.id}`}
        onPress={() => !hasAnswered && onSelect(option.id)}
        style={[
          styles.optionCard,
          highlight === 'correct' && styles.optionCorrect,
          highlight === 'incorrect' && styles.optionIncorrect,
        ]}
      >
        {option.image && (
          <ImageWithFallback uri={option.image} testID={`option-image-${option.id}`} style={styles.optionImage} fallbackIconSize={22} />
        )}
        {option.text && (
          <Text
            style={styles.optionText}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {option.text[language]}
          </Text>
        )}
        {highlight === 'correct' && (
          <View testID={`option-mark-${option.id}`} style={styles.correctMark}>
            <Text style={styles.markText}>✓</Text>
          </View>
        )}
        {highlight === 'incorrect' && (
          <View testID={`option-mark-${option.id}`} style={styles.incorrectMark}>
            <Text style={styles.markText}>✕</Text>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <ScrollView
      style={styles.scrollView}
      // The flex column below is sized to fit a real landscape screen without
      // scrolling in the normal case. This ScrollView is the safety net for
      // when it can't: questionCard/grid carry a minHeight (70/140), so on an
      // unusually short screen they stop shrinking and the content container
      // genuinely grows past the viewport instead of merely compressing
      // toward zero — at which point this actually scrolls, rather than
      // clipping content off-screen unreachably.
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.column}>
        {showProgress && (
          <View
            testID="quiz-progress"
            style={styles.progressRow}
            // The dots themselves stay plain, unlabeled decoration — simple
            // enough for a 2-4 year old to glance at without any digits on
            // screen. `accessible` collapses the whole row (and its child
            // dot Views) into ONE screen-reader-focusable node carrying this
            // label, so TalkBack/VoiceOver announces "Question 2 of 5" once
            // instead of reading out N separate, unlabeled dot views.
            accessible
            accessibilityRole="text"
            accessibilityLabel={tFormat('quizProgressLabel', language, {
              current: (currentIndex as number) + 1,
              total: totalQuestions as number,
            })}
          >
            {Array.from({ length: totalQuestions as number }).map((_, i) => (
              <View
                key={i}
                testID={`quiz-progress-dot-${i}`}
                style={[
                  styles.progressDot,
                  i < (currentIndex as number) && styles.progressDotDone,
                  i === currentIndex && styles.progressDotCurrent,
                ]}
              />
            ))}
          </View>
        )}

        <View style={styles.questionCard}>
          {question.question.image && (
            <ImageWithFallback uri={question.question.image} testID="question-image" style={styles.questionImage} fallbackIconSize={40} />
          )}
          {question.question.text && (
            <Text style={styles.questionText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {question.question.text[language]}
            </Text>
          )}
        </View>

        <View testID="quiz-options-grid" style={styles.grid}>
          {rows.map((rowOptions, rowIndex) => (
            <View key={rowIndex} testID={`quiz-options-row-${rowIndex}`} style={styles.gridRow}>
              {renderOption(rowOptions[0])}
              {renderOption(rowOptions[1])}
            </View>
          ))}
        </View>

        {hasAnswered && (
          <View testID="quiz-feedback" style={styles.feedbackRow}>
            {isCorrect && <Text style={styles.feedbackEmoji}>🎉</Text>}
            <Text
              style={[styles.feedbackText, isCorrect ? styles.feedbackCorrectText : styles.feedbackIncorrectText]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {isCorrect ? t('quizCorrect', language) : t(incorrectTextKey, language)}
            </Text>
            {isCorrect ? (
              <Pressable testID="quiz-next" onPress={onNext} style={styles.nextButton}>
                <Text style={styles.nextButtonText}>{t('quizNext', language)}</Text>
              </Pressable>
            ) : (
              // Two actions on a wrong answer: a gentle "Try Again" (re-picks
              // the SAME question — see onRetry above) alongside the
              // pre-existing "Next" (the app already lets a child move on
              // after a wrong answer without retrying — see QuizScreen's
              // "still advances and does not award a point" test — so Next
              // is kept rather than replaced, per this iteration's brief:
              // "show only a Retry-equivalent action unless existing quiz
              // behavior clearly requires something else").
              <View style={styles.feedbackButtonGroup}>
                <Pressable
                  testID="quiz-retry-answer"
                  onPress={onRetry}
                  style={styles.tryAgainButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('retry', language)}
                >
                  <Text style={styles.tryAgainButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {t('retry', language)}
                  </Text>
                </Pressable>
                <Pressable testID="quiz-next" onPress={onNext} style={styles.nextButtonSmall}>
                  <Text style={styles.nextButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {t('quizNext', language)}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {showCelebration && (
          // Decorative only: pointerEvents="none" so it can never intercept
          // a tap meant for the Next button or (defensively) an option
          // underneath it, and hidden from assistive tech since the
          // feedbackText above ("Correct!"/quizCorrect) already announces
          // the result — this is purely a visual flourish layered on top,
          // not new information.
          <Animated.View
            testID="quiz-celebration"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.celebrationOverlay}
          >
            <Animated.View
              style={[
                styles.celebrationBubble,
                { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
              ]}
            >
              <Text style={styles.celebrationEmoji}>🎉</Text>
              <Text style={styles.celebrationText} numberOfLines={1}>
                {t('quizCelebration', language)}
              </Text>
            </Animated.View>
          </Animated.View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.md,
  },
  column: {
    flex: 1,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginHorizontal: spacing.xs / 2,
    backgroundColor: colors.disabledBg,
    borderWidth: 2,
    borderColor: colors.disabledBorder,
  },
  progressDotDone: {
    backgroundColor: colors.sun,
    borderColor: colors.sunDark,
  },
  progressDotCurrent: {
    backgroundColor: colors.coral,
    borderColor: colors.coralDark,
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  // The question gets a smaller share of the flexed space than the answer
  // grid (2 vs 3) since it's a single card, while the grid has to fit 4.
  // minHeight (rather than flexBasis:0's implicit 0) is what actually makes
  // the ScrollView above a real safety net: without it, a flex:2 sibling can
  // shrink toward zero on a very short screen instead of ever exceeding the
  // viewport and triggering a scroll.
  questionCard: {
    flex: 2,
    minHeight: 70,
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 4,
    borderColor: colors.periwinkleDark,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: spacing.sm,
    ...shadow,
    elevation: 4,
  },
  questionImage: {
    height: '100%',
    aspectRatio: 1,
    borderRadius: radii.md,
  },
  questionText: {
    flexShrink: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
  },
  grid: {
    flex: 3,
    minHeight: 140,
    rowGap: spacing.xs,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    columnGap: spacing.xs,
  },
  optionCard: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    borderRadius: radii.lg,
    borderWidth: 3,
    borderColor: colors.disabledBorder,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
    columnGap: spacing.xs,
    ...shadow,
    elevation: 3,
  },
  optionCorrect: {
    borderColor: colors.mintDark,
    backgroundColor: colors.mint,
  },
  optionIncorrect: {
    borderColor: colors.coralDark,
    backgroundColor: colors.coral,
  },
  optionImage: {
    height: '100%',
    aspectRatio: 1,
    borderRadius: radii.md,
  },
  optionText: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
  },
  correctMark: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.mintDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incorrectMark: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.coralDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  imageFallback: {
    backgroundColor: colors.disabledBg,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {},
  feedbackRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing.sm,
  },
  feedbackEmoji: {
    fontSize: 22,
  },
  feedbackText: {
    flexShrink: 1,
    fontSize: 20,
    fontWeight: 'bold',
  },
  feedbackCorrectText: {
    color: colors.mintDark,
  },
  feedbackIncorrectText: {
    color: colors.coralDark,
  },
  nextButton: {
    backgroundColor: colors.coral,
    borderColor: colors.coralDark,
    borderWidth: 2,
    borderRadius: radii.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    ...shadow,
    elevation: 4,
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
  },
  // Wrong-answer footer shows two compact buttons side by side (Try Again +
  // Next) instead of one, so both get smaller padding than the single
  // full-size nextButton above to keep the footer's height unchanged and
  // avoid pushing content off-screen on a short/landscape device.
  feedbackButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.xs,
  },
  tryAgainButton: {
    backgroundColor: colors.sun,
    borderColor: colors.sunDark,
    borderWidth: 2,
    borderRadius: radii.xl,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    ...shadow,
    elevation: 4,
  },
  tryAgainButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.ink,
  },
  nextButtonSmall: {
    backgroundColor: colors.coral,
    borderColor: colors.coralDark,
    borderWidth: 2,
    borderRadius: radii.xl,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    ...shadow,
    elevation: 4,
  },
  // Absolutely positioned (not part of the flex flow) so this transient,
  // auto-fading celebration can never disturb the carefully tuned
  // proportional flex layout above (see the top-of-file comment on why
  // this screen avoids hand-computed pixel budgets). It's pinned to the
  // TOP of the column — over the question card, not the feedback/Next
  // row — so it never visually covers the Next button, and pointerEvents
  // "none" (set on the component) means it can never block a tap either
  // way.
  celebrationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  celebrationBubble: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 3,
    borderColor: colors.sunDark,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    ...shadow,
    elevation: 6,
  },
  celebrationEmoji: {
    fontSize: 26,
  },
  celebrationText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.ink,
  },
});
