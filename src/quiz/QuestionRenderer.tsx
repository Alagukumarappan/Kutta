import React, { useState } from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import type { Question } from '../types/quiz';
import type { Language } from '../types/profile';
import { t } from '../i18n/strings';

function ImageWithFallback({ uri, testID }: { uri: string; testID: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View testID={`${testID}-broken`} style={{ width: 80, height: 80, backgroundColor: '#ddd' }}>
        <Text>🖼️</Text>
      </View>
    );
  }

  return <Image source={{ uri }} testID={testID} onError={() => setFailed(true)} style={{ width: 80, height: 80 }} />;
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
    <View>
      {question.question.image && <ImageWithFallback uri={question.question.image} testID="question-image" />}
      {question.question.text && <Text>{question.question.text[language]}</Text>}

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
            style={{
              borderWidth: highlight ? 3 : 0,
              borderColor: highlight === 'correct' ? 'green' : highlight === 'incorrect' ? 'red' : 'transparent',
            }}
          >
            {option.image && <ImageWithFallback uri={option.image} testID={`option-image-${option.id}`} />}
            {option.text && <Text>{option.text[language]}</Text>}
          </Pressable>
        );
      })}

      {hasAnswered && (
        <View testID="quiz-feedback">
          <Text>{isCorrect ? t('quizCorrect', language) : t('quizIncorrect', language)}</Text>
          <Pressable testID="quiz-next" onPress={onNext}>
            <Text>{t('quizNext', language)}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
