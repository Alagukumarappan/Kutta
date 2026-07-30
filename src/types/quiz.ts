export interface BilingualText {
  en: string;
  de: string;
}

export interface QuestionOption {
  id: string;
  text?: BilingualText;
  image?: string;
}

export interface Question {
  id: string;
  category: 'image' | 'text';
  minAge: number;
  maxAge: number;
  question: {
    text?: BilingualText;
    image?: string;
  };
  options: [QuestionOption, QuestionOption, QuestionOption, QuestionOption];
  correctOptionId: string;
}

export interface QuestionsFile {
  questions: Question[];
}
