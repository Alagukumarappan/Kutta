import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Animated, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Question } from '../types/quiz';
import type { Language } from '../types/profile';
import { t } from '../i18n/strings';
import { colors, radii, spacing, shadow } from '../theme/tokens';
import { computeQuizLayout, OPTION_CARD_MARGIN, SCREEN_PADDING } from './layout';

// This screen is shown with headerShown:true (see RootNavigator), so the
// native-stack header already consumes the top safe-area inset before this
// component's flex:1 container gets its share of the window — but
// useWindowDimensions() below reports the FULL window height, header
// included. computeQuizLayout nets that back out so the sizing math below is
// computed against the space actually left for content, not the whole
// screen. It only affects how big we *try* to make things — the ScrollView
// wrapper is the real safety net if this estimate runs low.
//
// All the sizing arithmetic itself (header/padding reservations, the 2x2
// option grid, and the question image) lives in ./layout.ts as a pure,
// unit-tested function, since this math is fiddly enough that it has drifted
// out of sync with the actual styles before.

function ImageWithFallback({ uri, testID, size }: { uri: string; testID: string; size: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View
        testID={`${testID}-broken`}
        style={[styles.imageFallback, { width: size, height: size }]}
      >
        <Text style={styles.imageFallbackIcon}>🖼️</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      testID={testID}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: radii.md }}
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

  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const showProgress = typeof currentIndex === 'number' && typeof totalQuestions === 'number' && totalQuestions > 0;

  // This screen is landscape-only (see RootNavigator's runtime orientation
  // lock) and by far the busiest layout in the app: a question (text and/or
  // up to a sizeable image) plus a 4-option grid plus a feedback bar plus a
  // Next button. Stacked vertically that content can run to ~650-700dp,
  // roughly double what a real landscape phone gives us after the header
  // (~300-360dp). Laying the question out on the LEFT and the 2x2 option
  // grid on the RIGHT — side by side, using the width landscape actually
  // gives us — turns "everything stacked in one tall column" into a single
  // row that fits inside that height budget. Sizes below are derived from
  // the actual window rather than fixed constants so this adapts instead of
  // assuming one specific device.
  const { questionColumnWidth, optionsColumnWidth, optionSize, questionImageSize } = computeQuizLayout({
    windowWidth: width,
    windowHeight: height,
    insetTop: insets.top,
    insetBottom: insets.bottom,
    insetLeft: insets.left,
    insetRight: insets.right,
    showProgress,
    hasQuestionText: Boolean(question.question.text),
  });

  // A small pop-in for the feedback bar (bounce up to a slight overshoot,
  // then settle) so getting an answer right/wrong feels a bit more alive
  // than text just appearing — cheap enough with RN's built-in Animated API
  // that it isn't worth skipping, but subtle enough not to distract or delay
  // the child from tapping Next.
  const feedbackScale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (hasAnswered) {
      feedbackScale.setValue(0.6);
      Animated.spring(feedbackScale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }).start();
    }
  }, [hasAnswered, selectedOptionId, feedbackScale]);

  return (
    <ScrollView
      style={styles.scrollView}
      // flexGrow:1 (rather than a fixed flex:1 on the content) is a safety
      // net, not the primary fix: the row-based layout above is sized to fit
      // a real landscape screen without scrolling, but an unusually small
      // screen or an unusually large question image should degrade to
      // scrolling rather than clipping content off-screen unreachably.
      contentContainerStyle={[
        styles.screen,
        {
          paddingLeft: SCREEN_PADDING + insets.left,
          paddingRight: SCREEN_PADDING + insets.right,
          paddingBottom: SCREEN_PADDING + insets.bottom,
        },
      ]}
    >
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

      <View style={styles.row}>
        <View style={[styles.questionCard, { width: questionColumnWidth }]}>
          {question.question.image && (
            <ImageWithFallback uri={question.question.image} testID="question-image" size={questionImageSize} />
          )}
          {question.question.text && <Text style={styles.questionText}>{question.question.text[language]}</Text>}
        </View>

        <View style={[styles.optionsGrid, { width: optionsColumnWidth }]}>
          {question.options.map((option) => {
            const isCorrectOption = option.id === question.correctOptionId;
            const isSelectedOption = option.id === selectedOptionId;
            // Once answered: highlight the correct option green, and — if the
            // child picked a wrong one — highlight their (wrong) pick red too,
            // so the feedback is visible directly on the options, not just in
            // a separate line of text.
            const highlight = hasAnswered
              ? isCorrectOption
                ? 'correct'
                : isSelectedOption
                  ? 'incorrect'
                  : null
              : null;

            return (
              <Pressable
                key={option.id}
                testID={`option-${option.id}`}
                onPress={() => !hasAnswered && onSelect(option.id)}
                style={[
                  styles.optionCard,
                  { width: optionSize, height: optionSize },
                  highlight === 'correct' && styles.optionCorrect,
                  highlight === 'incorrect' && styles.optionIncorrect,
                ]}
              >
                {option.image && (
                  <ImageWithFallback
                    uri={option.image}
                    testID={`option-image-${option.id}`}
                    size={Math.max(24, optionSize - spacing.md * 2)}
                  />
                )}
                {option.text && <Text style={styles.optionText}>{option.text[language]}</Text>}
              </Pressable>
            );
          })}
        </View>
      </View>

      {hasAnswered && (
        <Animated.View
          testID="quiz-feedback"
          style={[styles.feedbackBar, { transform: [{ scale: feedbackScale }] }]}
        >
          {isCorrect && <Text style={styles.feedbackEmoji}>🎉</Text>}
          <Text
            style={[
              styles.feedbackText,
              isCorrect ? styles.feedbackCorrectText : styles.feedbackIncorrectText,
            ]}
          >
            {isCorrect ? t('quizCorrect', language) : t('quizIncorrect', language)}
          </Text>
          <Pressable testID="quiz-next" onPress={onNext} style={styles.nextButton}>
            <Text style={styles.nextButtonText}>{t('quizNext', language)}</Text>
          </Pressable>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: spacing.md,
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
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    columnGap: spacing.md,
  },
  questionCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 4,
    borderColor: colors.periwinkleDark,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    elevation: 4,
  },
  questionText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'center',
    justifyContent: 'center',
  },
  optionCard: {
    margin: OPTION_CARD_MARGIN,
    borderRadius: radii.lg,
    borderWidth: 3,
    borderColor: colors.disabledBorder,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
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
  optionText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
  },
  imageFallback: {
    backgroundColor: colors.disabledBg,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackIcon: {
    fontSize: 32,
  },
  feedbackBar: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: spacing.sm,
  },
  feedbackEmoji: {
    fontSize: 24,
  },
  feedbackText: {
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
