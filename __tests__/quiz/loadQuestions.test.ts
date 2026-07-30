import * as FileSystem from 'expo-file-system/legacy';
import { parseQuestionsFile, loadQuestions } from '../../src/quiz/loadQuestions';

jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: {
    readDirectoryAsync: jest.fn(),
    readAsStringAsync: jest.fn(),
  },
}));

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

  it('skips a question with two options sharing the same id', () => {
    const broken = {
      ...validQuestion,
      options: [
        { id: 'a', text: { en: 'Cat', de: 'Katze' } },
        { id: 'a', text: { en: 'Dog', de: 'Hund' } },
        { id: 'c', text: { en: 'Cow', de: 'Kuh' } },
        { id: 'd', text: { en: 'Elephant', de: 'Elefant' } },
      ],
    };
    const result = parseQuestionsFile(JSON.stringify({ questions: [broken] }));
    expect(result).toHaveLength(0);
  });

  it('skips a question with an inverted age range (minAge > maxAge)', () => {
    const broken = { ...validQuestion, minAge: 8, maxAge: 2 };
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

describe('loadQuestions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves relative image paths to the real SAF child URI found in quiz/images', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(async (uri: string) => {
      if (uri === 'content://tree/quiz') {
        return ['content://tree/quiz/questions.json', 'content://tree/quiz/images'];
      }
      if (uri === 'content://tree/quiz/images') {
        return ['content://tree/quiz/images/cat.png'];
      }
      return [];
    });
    (FileSystem.StorageAccessFramework.readAsStringAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({ questions: [validQuestion] })
    );

    const result = await loadQuestions('content://tree/quiz');

    expect(result).toHaveLength(1);
    expect(result[0].question.image).toBe('content://tree/quiz/images/cat.png');
    expect(result[0].question.image).not.toBe('images/cat.png');
  });

  it('leaves the image field unresolved when no matching file exists in quiz/images', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(async (uri: string) => {
      if (uri === 'content://tree/quiz') {
        return ['content://tree/quiz/questions.json', 'content://tree/quiz/images'];
      }
      if (uri === 'content://tree/quiz/images') {
        return ['content://tree/quiz/images/dog.png'];
      }
      return [];
    });
    (FileSystem.StorageAccessFramework.readAsStringAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({ questions: [validQuestion] })
    );

    const result = await loadQuestions('content://tree/quiz');

    expect(result[0].question.image).toBe('images/cat.png');
  });

  it('resolves option image paths as well as the question image', async () => {
    const withOptionImage = {
      ...validQuestion,
      options: [
        { id: 'a', image: 'images/opt-a.png' },
        validQuestion.options[1],
        validQuestion.options[2],
        validQuestion.options[3],
      ],
    };
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(async (uri: string) => {
      if (uri === 'content://tree/quiz') {
        return ['content://tree/quiz/questions.json', 'content://tree/quiz/images'];
      }
      if (uri === 'content://tree/quiz/images') {
        return ['content://tree/quiz/images/cat.png', 'content://tree/quiz/images/opt-a.png'];
      }
      return [];
    });
    (FileSystem.StorageAccessFramework.readAsStringAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({ questions: [withOptionImage] })
    );

    const result = await loadQuestions('content://tree/quiz');

    expect(result[0].options[0].image).toBe('content://tree/quiz/images/opt-a.png');
  });
});
