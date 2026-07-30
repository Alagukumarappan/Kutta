import { parseQuestionsFile } from '../../src/quiz/loadQuestions';

const validQuestion = {
  id: 'q001',
  category: 'image',
  minAge: 2,
  maxAge: 5,
  question: { text: { en: 'What animal?', de: 'Welches Tier?' }, image: 'images/cat.png' },
  options: [
    { id: 'a', text: { en: 'Cat', de: 'Katze' } },
    { id: 'b', text: { en: 'Dog', de: 'Hund' } },
    { id: 'c', text: { en: 'Cow', de: 'Kuh' } },
    { id: 'd', text: { en: 'Elephant', de: 'Elefant' } },
  ],
  correctOptionId: 'a',
};

describe('parseQuestionsFile', () => {
  it('parses a valid question', () => {
    const result = parseQuestionsFile(JSON.stringify({ questions: [validQuestion] }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('q001');
  });

  it('ignores unknown extra fields without crashing', () => {
    const withExtra = { ...validQuestion, futureField: { nested: true } };
    const result = parseQuestionsFile(JSON.stringify({ questions: [withExtra], schemaVersion: 99 }));
    expect(result).toHaveLength(1);
  });

  it('skips a question with fewer than 4 options', () => {
    const broken = { ...validQuestion, options: validQuestion.options.slice(0, 2) };
    const result = parseQuestionsFile(JSON.stringify({ questions: [broken, validQuestion] }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('q001');
  });

  it('skips a question whose correctOptionId does not match any option', () => {
    const broken = { ...validQuestion, correctOptionId: 'z' };
    const result = parseQuestionsFile(JSON.stringify({ questions: [broken] }));
    expect(result).toHaveLength(0);
  });

  it('skips a question with neither question.text nor question.image', () => {
    const broken = { ...validQuestion, question: {} };
    const result = parseQuestionsFile(JSON.stringify({ questions: [broken] }));
    expect(result).toHaveLength(0);
  });

  it('returns an empty array for invalid JSON instead of throwing', () => {
    expect(parseQuestionsFile('{not valid json')).toEqual([]);
  });

  it('returns an empty array when "questions" is missing or not an array', () => {
    expect(parseQuestionsFile(JSON.stringify({}))).toEqual([]);
    expect(parseQuestionsFile(JSON.stringify({ questions: 'nope' }))).toEqual([]);
  });
});
