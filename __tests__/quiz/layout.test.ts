import {
  computeQuizLayout,
  FEEDBACK_BAR_HEIGHT,
  GRID_GAP,
  HEADER_HEIGHT_ESTIMATE,
  MAX_OPTION_SIZE,
  MIN_OPTION_SIZE,
  MIN_QUESTION_IMAGE_SIZE,
  PROGRESS_ROW_HEIGHT,
  QUESTION_TEXT_RESERVED_HEIGHT,
  SCREEN_PADDING,
} from '../../src/quiz/layout';

describe('computeQuizLayout', () => {
  it('reserves the header/padding/progress/feedback-bar budget the same way the component comment describes', () => {
    // Hand-computed constants (must match the named constants in layout.ts):
    // FEEDBACK_BAR_HEIGHT = marginTop(8) + Next button height (paddingVertical 8*2 + borderWidth 2*2 + fontSize 18 = 38) = 46
    expect(FEEDBACK_BAR_HEIGHT).toBe(46);
    // GRID_GAP = 4 (OPTION_CARD_MARGIN) * 4 sides across 2 cells = 16
    expect(GRID_GAP).toBe(16);
    expect(QUESTION_TEXT_RESERVED_HEIGHT).toBe(28); // fontSize 24 + marginTop 4
  });

  it('fits a realistic landscape phone (800x360, header 56) for the worst case: image+text question, answered (feedback bar showing)', () => {
    const windowWidth = 800;
    const windowHeight = 360;

    const layout = computeQuizLayout({
      windowWidth,
      windowHeight,
      insetTop: 0,
      insetBottom: 0,
      insetLeft: 0,
      insetRight: 0,
      showProgress: true,
      hasQuestionText: true,
    });

    // --- Hand-computed expectations ---
    // availableHeight = 360 - 56 (header) - 0 (bottom inset) = 304
    // contentHeight = 304 - 16*2 (screen padding) - 30 (progress row) - 46 (feedback bar) = 196
    const expectedContentHeight = 360 - HEADER_HEIGHT_ESTIMATE - SCREEN_PADDING * 2 - PROGRESS_ROW_HEIGHT - FEEDBACK_BAR_HEIGHT;
    expect(expectedContentHeight).toBe(196);

    // columnsWidth = 800 - 16*2 (screen padding) - 16 (column gap) = 752
    // questionColumnWidth = 752 * 0.42 = 315.84
    // optionsColumnWidth = 752 - 315.84 = 436.16
    const columnsWidth = 800 - SCREEN_PADDING * 2 - 16;
    const expectedQuestionColumnWidth = columnsWidth * 0.42;
    const expectedOptionsColumnWidth = columnsWidth - expectedQuestionColumnWidth;
    expect(layout.questionColumnWidth).toBeCloseTo(expectedQuestionColumnWidth, 5);
    expect(layout.optionsColumnWidth).toBeCloseTo(expectedOptionsColumnWidth, 5);

    // optionSize = min((196-16)/2, (436.16-16)/2) = min(90, 210.08) = 90, within [72,170]
    const expectedOptionSize = Math.min((expectedContentHeight - GRID_GAP) / 2, (expectedOptionsColumnWidth - GRID_GAP) / 2);
    expect(expectedOptionSize).toBeCloseTo(90, 5);
    expect(layout.optionSize).toBeCloseTo(90, 5);
    expect(layout.optionSize).toBeGreaterThanOrEqual(MIN_OPTION_SIZE);
    expect(layout.optionSize).toBeLessThanOrEqual(MAX_OPTION_SIZE);

    // questionImageSize: card inset = padding 16*2 + border 4*2 = 40; plus text
    // reservation 28 on the height axis since hasQuestionText is true.
    // widthBudget = 315.84 - 40 = 275.84
    // heightBudget = 196 - 40 - 28 = 128
    // -> min(275.84, 128) = 128, within [60,200]
    const widthBudget = expectedQuestionColumnWidth - 40;
    const heightBudget = expectedContentHeight - 40 - QUESTION_TEXT_RESERVED_HEIGHT;
    expect(heightBudget).toBe(128);
    expect(Math.min(widthBudget, heightBudget)).toBeCloseTo(128, 5);
    expect(layout.questionImageSize).toBeCloseTo(128, 5);
    expect(layout.questionImageSize).toBeGreaterThanOrEqual(MIN_QUESTION_IMAGE_SIZE);

    // --- The actual overflow check the reviewer cared about ---
    // Sum every reserved band exactly as the rendered screen stacks them
    // (top padding, progress row, the question/options row, feedback bar,
    // bottom padding) and assert it does not exceed the real device height —
    // not just that intermediate values are positive. This is the specific
    // assertion a prior review found missing after two rounds of this
    // arithmetic drifting silently out of sync with the actual styles.
    const totalRenderedHeight =
      SCREEN_PADDING + // paddingTop
      PROGRESS_ROW_HEIGHT +
      layout.contentHeight + // the question/options row itself
      FEEDBACK_BAR_HEIGHT +
      SCREEN_PADDING; // paddingBottom
    expect(totalRenderedHeight).toBeLessThanOrEqual(windowHeight - HEADER_HEIGHT_ESTIMATE);

    expect(layout.contentHeight).toBeGreaterThan(0);
    expect(layout.optionSize).toBeGreaterThan(0);
    expect(layout.questionImageSize).toBeGreaterThan(0);
  });

  it('clamps optionSize and questionImageSize to their min/max bounds on extreme window sizes', () => {
    const tiny = computeQuizLayout({
      windowWidth: 300,
      windowHeight: 200,
      insetTop: 0,
      insetBottom: 0,
      insetLeft: 0,
      insetRight: 0,
      showProgress: false,
      hasQuestionText: false,
    });
    expect(tiny.optionSize).toBe(MIN_OPTION_SIZE);
    expect(tiny.questionImageSize).toBe(MIN_QUESTION_IMAGE_SIZE);

    const huge = computeQuizLayout({
      windowWidth: 2400,
      windowHeight: 1200,
      insetTop: 0,
      insetBottom: 0,
      insetLeft: 0,
      insetRight: 0,
      showProgress: false,
      hasQuestionText: false,
    });
    expect(huge.optionSize).toBe(MAX_OPTION_SIZE);
    expect(huge.questionImageSize).toBe(200); // MAX_QUESTION_IMAGE_SIZE
  });

  it('accounts for safe-area insets on all sides', () => {
    const withInsets = computeQuizLayout({
      windowWidth: 800,
      windowHeight: 360,
      insetTop: 20,
      insetBottom: 20,
      insetLeft: 30,
      insetRight: 30,
      showProgress: true,
      hasQuestionText: true,
    });
    const withoutInsets = computeQuizLayout({
      windowWidth: 800,
      windowHeight: 360,
      insetTop: 0,
      insetBottom: 0,
      insetLeft: 0,
      insetRight: 0,
      showProgress: true,
      hasQuestionText: true,
    });

    // Bottom inset eats into available height -> contentHeight shrinks or stays equal.
    expect(withInsets.contentHeight).toBeLessThanOrEqual(withoutInsets.contentHeight);
    // Left/right insets eat into available width -> columns shrink or stay equal.
    expect(withInsets.questionColumnWidth).toBeLessThanOrEqual(withoutInsets.questionColumnWidth);
    expect(withInsets.optionsColumnWidth).toBeLessThanOrEqual(withoutInsets.optionsColumnWidth);
  });
});
