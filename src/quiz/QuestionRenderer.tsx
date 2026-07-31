import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, ScrollView } from 'react-native';
import type { Question } from '../types/quiz';
import type { Language } from '../types/profile';
import { t } from '../i18n/strings';
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
  currentIndex,
  totalQuestions,
}: {
  question: Question;
  language: Language;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  onNext: () => void;
  // Optional: when provided, a row of progress dots is shown above the
  // question so a pre-reader can see how far through the session they are
  // without needing to parse numbers/text. currentIndex is 0-based.
  currentIndex?: number;
  totalQuestions?: number;
}) {
  const hasAnswered = selectedOptionId !== null;
  const isCorrect = hasAnswered && selectedOptionId === question.correctOptionId;

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
          <View testID="quiz-progress" style={styles.progressRow}>
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
            >
              {isCorrect ? t('quizCorrect', language) : t('quizIncorrect', language)}
            </Text>
            <Pressable testID="quiz-next" onPress={onNext} style={styles.nextButton}>
              <Text style={styles.nextButtonText}>{t('quizNext', language)}</Text>
            </Pressable>
          </View>
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
});
