import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Animated } from 'react-native';
import type { Question } from '../types/quiz';
import type { Language } from '../types/profile';
import { t } from '../i18n/strings';
import { colors, radii, spacing, shadow } from '../theme/tokens';

const OPTION_SIZE = 130;

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
    <View style={styles.screen}>
      {typeof currentIndex === 'number' && typeof totalQuestions === 'number' && totalQuestions > 0 && (
        <View testID="quiz-progress" style={styles.progressRow}>
          {Array.from({ length: totalQuestions }).map((_, i) => (
            <View
              key={i}
              testID={`quiz-progress-dot-${i}`}
              style={[
                styles.progressDot,
                i < currentIndex && styles.progressDotDone,
                i === currentIndex && styles.progressDotCurrent,
              ]}
            />
          ))}
        </View>
      )}

      <View style={styles.questionCard}>
        {question.question.image && (
          <ImageWithFallback uri={question.question.image} testID="question-image" size={150} />
        )}
        {question.question.text && <Text style={styles.questionText}>{question.question.text[language]}</Text>}
      </View>

      <View style={styles.optionsGrid}>
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
                highlight === 'correct' && styles.optionCorrect,
                highlight === 'incorrect' && styles.optionIncorrect,
              ]}
            >
              {option.image && (
                <ImageWithFallback uri={option.image} testID={`option-image-${option.id}`} size={OPTION_SIZE - spacing.md * 2} />
              )}
              {option.text && <Text style={styles.optionText}>{option.text[language]}</Text>}
            </Pressable>
          );
        })}
      </View>

      {hasAnswered && (
        <Animated.View
          testID="quiz-feedback"
          style={[styles.feedbackBar, { transform: [{ scale: feedbackScale }] }]}
        >
          {isCorrect && <Text style={styles.feedbackEmoji}>🎉</Text>}
          <Text style={[styles.feedbackText, isCorrect ? styles.feedbackCorrectText : styles.feedbackIncorrectText]}>
            {isCorrect ? t('quizCorrect', language) : t('quizIncorrect', language)}
          </Text>
          <Pressable testID="quiz-next" onPress={onNext} style={styles.nextButton}>
            <Text style={styles.nextButtonText}>{t('quizNext', language)}</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    padding: spacing.md,
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
  questionCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 4,
    borderColor: colors.periwinkleDark,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadow,
    elevation: 4,
  },
  questionText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: OPTION_SIZE * 2 + spacing.md * 3,
  },
  optionCard: {
    width: OPTION_SIZE,
    height: OPTION_SIZE,
    margin: spacing.sm,
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
    fontSize: 22,
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
    marginTop: spacing.md,
    alignItems: 'center',
  },
  feedbackEmoji: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  feedbackText: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
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
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.white,
  },
});
