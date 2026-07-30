import React, { useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
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
}: {
  question: Question;
  language: Language;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  onNext: () => void;
}) {
  const hasAnswered = selectedOptionId !== null;
  const isCorrect = hasAnswered && selectedOptionId === question.correctOptionId;

  return (
    <View style={styles.screen}>
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
        <View testID="quiz-feedback" style={styles.feedbackBar}>
          <Text style={[styles.feedbackText, isCorrect ? styles.feedbackCorrectText : styles.feedbackIncorrectText]}>
            {isCorrect ? t('quizCorrect', language) : t('quizIncorrect', language)}
          </Text>
          <Pressable testID="quiz-next" onPress={onNext} style={styles.nextButton}>
            <Text style={styles.nextButtonText}>{t('quizNext', language)}</Text>
          </Pressable>
        </View>
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
