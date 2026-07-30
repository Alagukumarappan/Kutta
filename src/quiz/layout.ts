import { clamp, spacing } from '../theme/tokens';

// Pure sizing math for QuestionRenderer's landscape, question-left /
// 2x2-option-grid-right layout. Pulled out of the component so the arithmetic
// (which is fiddly enough that it has drifted out of sync with the actual
// styles at least once already) can be unit-tested against hand-computed
// expected values instead of relying on another manual review to catch drift.

export const HEADER_HEIGHT_ESTIMATE = 56;
export const SCREEN_PADDING = spacing.md; // 16 - outer padding on all sides
export const PROGRESS_ROW_HEIGHT = 30; // dots (up to 18) + margin
export const COLUMN_GAP = spacing.md; // gap between the question column and the options column
export const QUESTION_COLUMN_RATIO = 0.42; // question column gets ~42% of the row width, options get the rest

export const MIN_OPTION_SIZE = 72;
export const MAX_OPTION_SIZE = 170;
export const MIN_QUESTION_IMAGE_SIZE = 60;
export const MAX_QUESTION_IMAGE_SIZE = 200;

// The 2x2 option grid: each optionCard has `margin: OPTION_CARD_MARGIN` on
// ALL sides (see styles.optionCard), so two cells stacked along an axis
// consume 2*optionSize PLUS 4*OPTION_CARD_MARGIN (each cell contributes
// margin on both its near and far side). Kept as one named constant used by
// both the style and this arithmetic so they can't drift apart again.
export const OPTION_CARD_MARGIN = spacing.xs; // 4
export const GRID_GAP = OPTION_CARD_MARGIN * 4; // 16 - total margin consumed per axis by 2 cells

// The feedback bar is laid out as a single ROW (emoji + text + Next button
// side by side), not stacked, so its real height is the tallest single item
// in that row (not the sum of all of them) plus the bar's own marginTop.
// Tallest item is the Next button: paddingVertical*2 + borderWidth*2 + fontSize.
const FEEDBACK_BAR_MARGIN_TOP = spacing.sm; // 8
const NEXT_BUTTON_PADDING_VERTICAL = spacing.sm; // 8
const NEXT_BUTTON_BORDER_WIDTH = 2;
const NEXT_BUTTON_FONT_SIZE = 18;
const NEXT_BUTTON_HEIGHT =
  NEXT_BUTTON_PADDING_VERTICAL * 2 + NEXT_BUTTON_BORDER_WIDTH * 2 + NEXT_BUTTON_FONT_SIZE; // 8*2+2*2+18 = 38
export const FEEDBACK_BAR_HEIGHT = FEEDBACK_BAR_MARGIN_TOP + NEXT_BUTTON_HEIGHT; // 8+38 = 46

// The question card's own chrome (padding on all sides + border on all
// sides) eats into the space available for its image, on both axes.
const QUESTION_CARD_PADDING = spacing.md; // 16
const QUESTION_CARD_BORDER_WIDTH = 4;
const QUESTION_CARD_INSET = QUESTION_CARD_PADDING * 2 + QUESTION_CARD_BORDER_WIDTH * 2; // 16*2+4*2 = 40

// When question text is shown (alone, or below the image), it reserves its
// own line of height inside the card: fontSize 24 + the marginTop gap added
// between it and whatever is above it.
const QUESTION_TEXT_FONT_SIZE = 24;
const QUESTION_TEXT_MARGIN_TOP = spacing.xs; // 4
export const QUESTION_TEXT_RESERVED_HEIGHT = QUESTION_TEXT_FONT_SIZE + QUESTION_TEXT_MARGIN_TOP; // 28

export interface QuizLayoutInput {
  windowWidth: number;
  windowHeight: number;
  insetTop: number;
  insetBottom: number;
  insetLeft: number;
  insetRight: number;
  showProgress: boolean;
  hasQuestionText: boolean;
}

export interface QuizLayout {
  contentHeight: number;
  questionColumnWidth: number;
  optionsColumnWidth: number;
  optionSize: number;
  questionImageSize: number;
}

export function computeQuizLayout(input: QuizLayoutInput): QuizLayout {
  const availableHeight = input.windowHeight - HEADER_HEIGHT_ESTIMATE - input.insetBottom;
  const availableWidth = input.windowWidth - input.insetLeft - input.insetRight;

  const contentHeight = Math.max(
    0,
    availableHeight - SCREEN_PADDING * 2 - (input.showProgress ? PROGRESS_ROW_HEIGHT : 0) - FEEDBACK_BAR_HEIGHT
  );

  const columnsWidth = Math.max(0, availableWidth - SCREEN_PADDING * 2 - COLUMN_GAP);
  const questionColumnWidth = columnsWidth * QUESTION_COLUMN_RATIO;
  const optionsColumnWidth = columnsWidth - questionColumnWidth;

  // Two rows of two cells must fit within contentHeight, and two columns of
  // cells must fit within optionsColumnWidth - take whichever axis is
  // tighter, same approach as computeResponsiveSquareSize elsewhere.
  const optionSize = clamp(
    Math.min((contentHeight - GRID_GAP) / 2, (optionsColumnWidth - GRID_GAP) / 2),
    MIN_OPTION_SIZE,
    MAX_OPTION_SIZE
  );

  const questionCardInsetHeight =
    QUESTION_CARD_INSET + (input.hasQuestionText ? QUESTION_TEXT_RESERVED_HEIGHT : 0);

  const questionImageSize = clamp(
    Math.min(questionColumnWidth - QUESTION_CARD_INSET, contentHeight - questionCardInsetHeight),
    MIN_QUESTION_IMAGE_SIZE,
    MAX_QUESTION_IMAGE_SIZE
  );

  return { contentHeight, questionColumnWidth, optionsColumnWidth, optionSize, questionImageSize };
}
