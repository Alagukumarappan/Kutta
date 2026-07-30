import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { loadQuestions } from './loadQuestions';
import { buildSession, initialSessionState, answerCurrentQuestion, QuizSessionState } from './quizSession';
import { QuestionRenderer } from './QuestionRenderer';

export function QuizScreen({ quizFolderUri, childAge }: { quizFolderUri: string; childAge: number }) {
  const { t, language } = useLanguage();
  const [state, setState] = useState<QuizSessionState | null>(null);

  useEffect(() => {
    loadQuestions(quizFolderUri).then((all) => {
      const session = buildSession(all, childAge);
      setState(initialSessionState(session));
    });
  }, [quizFolderUri, childAge]);

  if (!state) return <View testID="quiz-loading" />;

  if (state.session.length === 0) {
    return (
      <View>
        <Text>{t('emptyQuiz')}</Text>
      </View>
    );
  }

  if (state.isFinished) {
    return (
      <View>
        <Text>{tFormat('quizScore', language, { score: state.score, total: state.session.length })}</Text>
      </View>
    );
  }

  const currentQuestion = state.session[state.currentIndex];

  return (
    <QuestionRenderer
      question={currentQuestion}
      language={language}
      onAnswer={(optionId) => setState((prev) => (prev ? answerCurrentQuestion(prev, optionId) : prev))}
    />
  );
}
