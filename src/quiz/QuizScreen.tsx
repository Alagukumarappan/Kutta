import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { loadQuestions } from './loadQuestions';
import { buildSession, initialSessionState, answerCurrentQuestion, QuizSessionState } from './quizSession';
import { QuestionRenderer } from './QuestionRenderer';

export function QuizScreen({ quizFolderUri, childAge }: { quizFolderUri: string; childAge: number }) {
  const { t, language } = useLanguage();
  const [state, setState] = useState<QuizSessionState | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  // Bumped on Retry to force a fresh load attempt even when quizFolderUri and
  // childAge haven't changed (e.g. a transient failure).
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setState(null);

    loadQuestions(quizFolderUri)
      .then((all) => {
        if (cancelled) return;
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

  if (error) {
    return (
      <View testID="quiz-error">
        <Text>{t('loadError')}</Text>
        <Pressable testID="quiz-retry" onPress={() => setRetryToken((n) => n + 1)}>
          <Text>{t('retry')}</Text>
        </Pressable>
      </View>
    );
  }

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

  function handleSelect(optionId: string) {
    setSelectedOptionId(optionId);
  }

  function handleNext() {
    if (selectedOptionId === null) return;
    setState((prev) => (prev ? answerCurrentQuestion(prev, selectedOptionId) : prev));
    setSelectedOptionId(null);
  }

  return (
    <QuestionRenderer
      question={currentQuestion}
      language={language}
      selectedOptionId={selectedOptionId}
      onSelect={handleSelect}
      onNext={handleNext}
    />
  );
}
