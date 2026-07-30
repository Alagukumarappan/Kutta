import type { Question } from '../types/quiz';

export function filterQuestionsByAge(questions: Question[], age: number): Question[] {
  return questions.filter((q) => age >= q.minAge && age <= q.maxAge);
}
