import type { Question } from '../types/quiz';
import { filterQuestionsByAge } from './filterQuestions';
import { shuffle } from './shuffle';

const SESSION_LENGTH = 20;

export function buildSession(allQuestions: Question[], age: number, rng?: () => number): Question[] {
  const eligible = filterQuestionsByAge(allQuestions, age);
  const shuffled = shuffle(eligible, rng);
  return shuffled.slice(0, SESSION_LENGTH);
}

export interface QuizSessionState {
  session: Question[];
  currentIndex: number;
  score: number;
  isFinished: boolean;
}

export function initialSessionState(session: Question[]): QuizSessionState {
  return {
    session,
    currentIndex: 0,
    score: 0,
    isFinished: session.length === 0,
  };
}

export function answerCurrentQuestion(state: QuizSessionState, selectedOptionId: string): QuizSessionState {
  if (state.isFinished) return state;

  const current = state.session[state.currentIndex];
  const correct = current.correctOptionId === selectedOptionId;
  const nextIndex = state.currentIndex + 1;

  return {
    ...state,
    score: correct ? state.score + 1 : state.score,
    currentIndex: nextIndex,
    isFinished: nextIndex >= state.session.length,
  };
}
