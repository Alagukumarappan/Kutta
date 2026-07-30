import React, { useState } from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import type { Question } from '../types/quiz';
import type { Language } from '../types/profile';

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
  onAnswer,
}: {
  question: Question;
  language: Language;
  onAnswer: (optionId: string) => void;
}) {
  return (
    <View>
      {question.question.image && <ImageWithFallback uri={question.question.image} testID="question-image" />}
      {question.question.text && <Text>{question.question.text[language]}</Text>}

      {question.options.map((option) => (
        <Pressable key={option.id} onPress={() => onAnswer(option.id)}>
          {option.image && <ImageWithFallback uri={option.image} testID={`option-image-${option.id}`} />}
          {option.text && <Text>{option.text[language]}</Text>}
        </Pressable>
      ))}
    </View>
  );
}
