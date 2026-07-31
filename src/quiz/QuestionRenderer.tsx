import React from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Animated, Modal } from 'react-native';
import type { Question } from '../types/quiz';
import type { Language } from '../types/profile';
import { t, tFormat } from '../i18n/strings';
import {
  colors,
  radii,
  spacing,
  elevation,
  typography,
  touchTarget,
  surfaceWash,
  motion,
  getActivityPalette,
  AnimatedPressable,
  SurfaceWash,
  RaisedPrimaryButton,
  RaisedSecondaryButton,
  useReducedMotion,
} from '../design-system';

// This screen rebuilds the quiz UI as a single-question, STACKED layout
// (progress row on top, question card, then a 2x2 answer grid below it,
// then a feedback/Next footer) rather than the old side-by-side
// question-left/options-right split.
//
// Two prior rounds of bugs here came from hand-summing exact pixel budgets
// (padding + border + font-size arithmetic that has to add up exactly
// against the real rendered styles) in a separate ./layout.ts module. This
// version deliberately has NO such module: every section below is sized with
// flexbox ratios (flex: N on siblings inside a flex:1 column) so the
// available height is divided proportionally by Yoga at render time, using
// whatever space the device actually has, instead of a number this file
// has to predict in advance. The progress row and the feedback/Next footer
// are NOT given a flex share — they're auto-sized to their own content,
// and the flexed question/grid sections simply receive whatever height is
// left over, which Yoga computes correctly without this file doing the sum.
//
// The one place a component still needs *some* numeric sizing is the images
// (RN's <Image> doesn't size itself from content) - those use
// aspectRatio: 1 + resizeMode="contain" inside a flex-sized box instead of a
// pixel value computed here, so they simply fill whatever square-ish space
// their flex parent ends up with.
//
// The 2x2 answer grid is built from two EXPLICIT row <View>s (not
// flexWrap:'wrap') for the same reason the Photo Puzzle screen was fixed the
// same way: flexWrap decides where to break a row using float-precision
// comparisons, and fractional dp values (routine on real devices) can cause
// an early/late wrap. An explicit "exactly 2 per row" structure can't wrap
// unpredictably because there is no wrapping decision to make.
//
// REDESIGN (iteration 2, onto src/design-system/): the question card and
// answer options now reuse the new design system's visual language (violet
// "quiz" accent via getActivityPalette, elevation presets, SurfaceWash's
// two-tone wash) and its shared AnimatedPressable tilt/lift primitive for
// the options, rather than each hand-rolling its own Animated.Value + spring
// + interpolate wiring. Deliberately NOT built on design-system's own
// `RaisedCard`, though: RaisedCard's static (no-onPress) render path wraps
// its bordered/shadowed "face" in a plain, non-flexed View, so it can't be
// asked to fill an exact flex-ratio share of the remaining screen height —
// exactly what this file's whole layout strategy (see the flex-ratio
// comment above) depends on for the question card, and for each option
// filling its grid cell. AnimatedPressable, by contrast, lets its `style`
// AND `innerStyle` both be supplied by the caller, so `flex: 1` can be
// threaded through every level the way the old hand-rolled optionCard did —
// so it's used directly instead, alongside a plain SurfaceWash for the same
// two-tone depth RaisedCard would have added. All the shared design-system
// color/spacing/elevation/typography tokens are used throughout, keeping
// this screen visually consistent with the rest of the redesign without
// inheriting a component whose sizing contract doesn't fit this screen's
// layout.

const quizPalette = getActivityPalette('quiz');

function ImageWithFallback({
  uri,
  testID,
  style,
  fallbackIconSize = 32,
}: {
  uri: string;
  testID: string;
  style: object;
  fallbackIconSize?: number;
}) {
  const [failed, setFailed] = React.useState(false);

  if (failed) {
    return (
      <View testID={`${testID}-broken`} style={[styles.imageFallback, style]}>
        <Text style={{ fontSize: fallbackIconSize }}>🖼️</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      testID={testID}
      onError={() => setFailed(true)}
      style={[styles.image, style]}
      resizeMode="contain"
    />
  );
}

export function QuestionRenderer({
  question,
  language,
  selectedOptionId,
  onSelect,
  onNext,
  onRetry,
  currentIndex,
  totalQuestions,
  childAge,
}: {
  question: Question;
  language: Language;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  onNext: () => void;
  // Called when the child taps "Try Again" after a wrong answer. Expected to
  // clear the parent's selectedOptionId (see QuizScreen.handleRetry) so the
  // options re-enable and the child can pick again on the SAME question —
  // this never itself scores anything; only onNext ever does that, so a
  // retry can never cause a duplicate/extra score for one question.
  onRetry?: () => void;
  // Optional: when provided, a row of progress dots is shown above the
  // question so a pre-reader can see how far through the session they are
  // without needing to parse numbers/text. currentIndex is 0-based.
  currentIndex?: number;
  totalQuestions?: number;
  // The active child's profile age (2-8), used only to pick the
  // age-appropriate wrong-answer wording tier below. Optional and defaults
  // to the older (5-8) tier so existing/other call sites that don't pass it
  // still get sensible, non-crashing wording.
  childAge?: number;
}) {
  const hasAnswered = selectedOptionId !== null;
  const isCorrect = hasAnswered && selectedOptionId === question.correctOptionId;
  // Ages 2-4 get the gentlest, simplest phrasing; 5-8 gets a slightly more
  // capable-sounding nudge. See quizIncorrectYoung/quizIncorrectOlder in
  // src/i18n/strings.ts for the actual wording in both languages.
  const incorrectTextKey = typeof childAge === 'number' && childAge <= 4 ? 'quizIncorrectYoung' : 'quizIncorrectOlder';

  // Deliberate, developer-requested behavior change (supersedes the earlier
  // "never leak the answer through the wording" design): on a WRONG answer,
  // the feedback overlay now also names/shows the correct option itself,
  // e.g. "Nice try! Take another look. The correct answer is: 4" —
  // alongside the encouraging line above, not instead of it. This is a
  // natural extension of behavior the grid already has (the ✓/✕ marks in
  // renderOption already visually reveal the correct option), not a new
  // leak.
  //
  // Looked up via correctOptionId (never selectedOptionId) so this always
  // names/shows the RIGHT option, regardless of which wrong option the
  // child picked. Text-and/or-image aware, matching how option cards
  // elsewhere in this file already render combined content: text-only
  // options show just the label, image-only options show just a small
  // picture (reusing ImageWithFallback for the same broken-image handling
  // the answer grid already gets), and options with both show both.
  // loadQuestions' own validation (isValidOption) already guarantees every
  // loaded option has at least one of text/image, but correctAnswerImage
  // and correctAnswerText both default to null regardless, so even a
  // hand-built Question missing both (e.g. in a test) can't crash or print
  // "undefined" — the reveal simply renders nothing extra in that case.
  const correctOption = question.options.find((option) => option.id === question.correctOptionId);
  const correctAnswerText = !isCorrect && correctOption?.text ? correctOption.text[language] : null;
  const correctAnswerImage = !isCorrect && correctOption?.image ? correctOption.image : null;
  const showCorrectAnswerReveal = correctAnswerText !== null || correctAnswerImage !== null;

  // Brief, non-blocking "correct answer" celebration: a pop-in/fade-out
  // bubble that plays alongside (never in front of, and never gating) the
  // existing feedback banner + Next button below. Built with RN's built-in
  // Animated API only — react-native-reanimated is listed in package.json
  // but is wired into neither babel.config.js nor used anywhere in this
  // app today, and adding that wiring is a separate, riskier change than
  // this iteration's scope, so Animated (bundled with react-native, no new
  // dependency) is used instead.
  //
  // The effect below only re-runs when `isCorrect` flips from false to
  // true. Combined with each option's own `disabled={hasAnswered}` guard
  // (further down), one answer can never (a) score twice or (b)
  // replay/stack this celebration twice, even under rapid/repeated tapping
  // on an option.
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;
  const [showCelebration, setShowCelebration] = React.useState(false);
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!isCorrect) {
      setShowCelebration(false);
      return;
    }

    setShowCelebration(true);
    scaleAnim.setValue(0);
    opacityAnim.setValue(0);

    // Bounded, non-flashing sequence: pop in (~160ms), hold briefly
    // (900ms), then fade out (320ms) — well under a couple of seconds
    // total, so it always auto-resolves on its own. Uses the shared
    // `motion` tokens (the same celebrate spring + fast/celebration/slow
    // durations `CelebrationOverlay`'s own tone="success" bubble uses for
    // this identical effect) rather than separately hand-tuned literals —
    // this is also the exact "900ms hold, 320ms fade-out" pairing
    // REDESIGN_PROGRESS.md's Animation Inventory documents for this bubble.
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, ...motion.spring.celebrate }),
        Animated.timing(opacityAnim, { toValue: 1, duration: motion.duration.fast, useNativeDriver: true }),
      ]),
      Animated.delay(motion.duration.celebration),
      Animated.timing(opacityAnim, { toValue: 0, duration: motion.duration.slow, useNativeDriver: true }),
    ]);

    animation.start(({ finished }) => {
      if (finished && isMountedRef.current) setShowCelebration(false);
    });

    // Stop the animation (cancelling any pending step/callback) if the
    // question changes, the child navigates away, or this component
    // unmounts mid-celebration — no leaked timers/handles.
    return () => {
      animation.stop();
    };
    // question.id is included defensively (not just `isCorrect`): today
    // QuizScreen always resets selectedOptionId to null before advancing to
    // the next question, so isCorrect already cycles true -> false -> ...
    // on every question change — but keying the effect on the question too
    // means this can't silently start replaying a stale celebration even if
    // that reset contract ever changes elsewhere.
  }, [isCorrect, question.id, scaleAnim, opacityAnim]);

  // Brief pop-in entrance for the feedback CARD ITSELF (the whole overlay
  // "arriving"), kept entirely separate from scaleAnim/opacityAnim above
  // (the celebration bubble's own independent timeline) — different
  // Animated.Values, different effect, so neither can interfere with or
  // accidentally restart the other. Starts from a slightly shrunk/invisible
  // state (0.85/0) and springs to rest (1/1) — a couple hundred ms, well
  // under the celebration bubble's own pacing, since this fires on every
  // single answer (right or wrong) and must never feel showy.
  const cardScaleAnim = React.useRef(new Animated.Value(0.85)).current;
  const cardOpacityAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!hasAnswered) {
      // Reset to the pre-entrance state while the modal is unmounted, so
      // the NEXT time hasAnswered flips true (a fresh answer, or an answer
      // after Retry) the pop-in plays again from scratch instead of
      // silently starting from wherever the last animation left off.
      cardScaleAnim.setValue(0.85);
      cardOpacityAnim.setValue(0);
      return;
    }

    const animation = Animated.parallel([
      Animated.spring(cardScaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
      Animated.timing(cardOpacityAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]);
    animation.start();

    // Mirrors the celebration effect's own cleanup: stop (don't leave
    // running) if the answer is retried, the question changes, or this
    // component unmounts mid-animation.
    return () => {
      animation.stop();
    };
  }, [hasAnswered, question.id, cardScaleAnim, cardOpacityAnim]);

  const feedbackCardEntranceStyle = {
    opacity: cardOpacityAnim,
    transform: [{ scale: cardScaleAnim }],
  };

  // Brief pop-in for the correct/incorrect MARK BADGES (the ✓/✕ on the
  // option cards themselves), independent of both the celebration bubble
  // and the feedback card's own entrance above — those live inside the
  // overlay, this lives on the answer grid, and all three should be able to
  // animate without any of them restarting another. Both badges (the
  // correct option's ✓ and, when wrong, the selected option's ✕) always
  // appear at the exact same instant — the moment hasAnswered flips true —
  // so one shared scale/opacity driver pair is enough; there's never a case
  // where one badge needs to be mid-pop while the other is still hidden.
  // Mirrors cardScaleAnim/cardOpacityAnim's own reset-on-`!hasAnswered` +
  // animate-on-true shape exactly, so a badge on question 2 (or after a
  // Retry + re-answer) always replays from scratch instead of silently
  // sitting at its question-1 resting value.
  const markScaleAnim = React.useRef(new Animated.Value(0.3)).current;
  const markOpacityAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!hasAnswered) {
      // Reset to the pre-entrance state while no mark is shown, so the next
      // reveal (a fresh answer, or an answer after Retry, or a new question)
      // pops in again from scratch rather than resuming from rest.
      markScaleAnim.setValue(0.3);
      markOpacityAnim.setValue(0);
      return;
    }

    // Same recipe as the feedback card's own pop-in above (speed/bounciness
    // 20/6 spring for scale), just a touch shorter on the opacity timing
    // (150ms vs 220ms) since this badge is a much smaller accent riding
    // alongside — not replacing — the instant color highlight on the option
    // card itself (see optionCorrect/optionIncorrect below, deliberately
    // left uneased per iteration 4's precedent).
    const animation = Animated.parallel([
      Animated.spring(markScaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
      Animated.timing(markOpacityAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]);
    animation.start();

    // Mirrors the feedback card effect's own cleanup: stop (don't leave
    // running) if the answer is retried, the question changes, or this
    // component unmounts mid-animation.
    return () => {
      animation.stop();
    };
  }, [hasAnswered, question.id, markScaleAnim, markOpacityAnim]);

  const markEntranceStyle = {
    opacity: markOpacityAnim,
    transform: [{ scale: markScaleAnim }],
  };

  const showProgress = typeof currentIndex === 'number' && typeof totalQuestions === 'number' && totalQuestions > 0;

  // Progress dot transition animations: when the CURRENT dot advances by one
  // question, the newly-current dot springs from its "not-yet" size ratio up
  // to its full current-dot size (14px -> 18px) instead of snapping, and the
  // dot that just stopped being current (now "done") springs back down from
  // that current-dot size to its resting done-dot size (18px -> 14px)
  // instead of snapping. Colors (backgroundColor/borderColor) are left as
  // instant style swaps deliberately: RN's built-in Animated API has no
  // interpolateColor (only react-native-reanimated does, and that isn't
  // wired into this app — see the scaleAnim/opacityAnim comment above), and
  // cross-fading two stacked color layers per dot — times up to 20 dots — is
  // a lot of added complexity/nodes for a transition on something this
  // small (14-18px) that a 2-8 year old glances at rather than studies. So
  // only the SIZE transition (the part that actually reads as "something
  // changed here") is animated; the color settles instantly alongside it.
  //
  // Implemented as a transform:scale on each dot's own fixed-size View
  // (never width/height — those aren't supported on the native driver and
  // would also disturb this row's layout, which the 20-dot screen-fit test
  // below pins down), so the dot's literal style.width/height stay exactly
  // 14 or 18 the whole time; only how it's drawn on screen eases between
  // sizes. One Animated.Value per dot, created lazily and cached by index in
  // a Map (not a fixed-size array, since totalQuestions varies per session)
  // — cheap even at the real 20-dot maximum, since idle dots simply sit at
  // rest (scale 1) with no animation running.
  const dotScalesRef = React.useRef<Map<number, Animated.Value>>(new Map());
  // Same OS reduce-motion check already applied to CelebrationOverlay, the
  // score card, and useTiltPress — this dot-pop is a small but genuine
  // spring transform, and can fire up to 20 times per session.
  const reducedMotion = useReducedMotion();
  function getDotScale(index: number): Animated.Value {
    let value = dotScalesRef.current.get(index);
    if (!value) {
      value = new Animated.Value(1);
      dotScalesRef.current.set(index, value);
    }
    return value;
  }

  // Tracks the previous currentIndex purely to detect a real question
  // ADVANCE (as opposed to the initial mount, or a Retry — which never
  // changes currentIndex, see the onRetry prop doc above) so this can't fire
  // an unwanted pop on first render or on Try Again.
  const prevCurrentIndexRef = React.useRef<number | undefined>(currentIndex);
  const activeDotAnimationsRef = React.useRef<Map<number, Animated.CompositeAnimation>>(new Map());

  React.useEffect(() => {
    const prevIndex = prevCurrentIndexRef.current;
    prevCurrentIndexRef.current = currentIndex;

    if (!showProgress || prevIndex === currentIndex) return;

    const NOT_CURRENT_TO_CURRENT_RATIO = 14 / 18;
    const CURRENT_TO_DONE_RATIO = 18 / 14;

    function pop(index: number, fromRatio: number) {
      const scale = getDotScale(index);
      activeDotAnimationsRef.current.get(index)?.stop();
      if (reducedMotion) {
        // Jump straight to the resting scale — the dot's width/height style
        // swap (progressDotDone/Current) still conveys progress on its own;
        // only the spring bounce itself is skipped.
        scale.setValue(1);
        return;
      }
      scale.setValue(fromRatio);
      // Quick, light spring — well under 300ms — matching this file's other
      // small transient feedback springs (e.g. the feedback card's own
      // pop-in above) rather than the bouncier celebration bubble, since
      // this can fire up to 20 times per session and must never feel showy.
      const animation = Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 6,
      });
      activeDotAnimationsRef.current.set(index, animation);
      animation.start();
    }

    if (typeof currentIndex === 'number') {
      pop(currentIndex, NOT_CURRENT_TO_CURRENT_RATIO);
    }
    if (typeof prevIndex === 'number') {
      pop(prevIndex, CURRENT_TO_DONE_RATIO);
    }
  }, [currentIndex, showProgress, reducedMotion]);

  React.useEffect(() => {
    return () => {
      activeDotAnimationsRef.current.forEach((animation) => animation.stop());
    };
  }, []);

  const rows: [ [typeof question.options[number], typeof question.options[number]], [typeof question.options[number], typeof question.options[number]] ] = [
    [question.options[0], question.options[1]],
    [question.options[2], question.options[3]],
  ];

  function renderOption(option: Question['options'][number], index: number) {
    const isCorrectOption = option.id === question.correctOptionId;
    const isSelectedOption = option.id === selectedOptionId;
    // Once answered: highlight the correct option green, and — if the child
    // picked a wrong one — highlight their (wrong) pick red too, so the
    // feedback is visible directly on the options, not just in the footer.
    const highlight = hasAnswered ? (isCorrectOption ? 'correct' : isSelectedOption ? 'incorrect' : null) : null;

    return (
      <AnimatedPressable
        key={option.id}
        testID={`option-${option.id}`}
        onPress={() => onSelect(option.id)}
        // Disabling the pressable (rather than a manual `!hasAnswered &&`
        // guard) both stops onPress/onPressIn/onPressOut from firing AND —
        // via AnimatedPressable's own disabled-transition effect — snaps
        // any in-flight tilt back to resting immediately, so no residual
        // tilt can linger into the highlighted correct/incorrect state even
        // if a press-in and the answer reveal race.
        disabled={hasAnswered}
        tilt="regular"
        style={styles.optionSlot}
        innerStyle={[
          styles.optionCard,
          highlight === 'correct' && styles.optionCorrect,
          highlight === 'incorrect' && styles.optionIncorrect,
        ]}
        // Image-only options (no `option.text`) previously fell through to
        // `undefined` here, leaving a screen-reader user with an unlabeled
        // "Button" for every one of a question's four picture answers — the
        // entire interaction for that question type. Falls back to a plain
        // positional label ("Answer option 2") so it's at least
        // distinguishable and announced as tappable, same idea as
        // quizProgressLabel's own `{number}`-templated announcement above.
        accessibilityLabel={
          option.text ? option.text[language] : tFormat('quizAnswerOptionLabel', language, { number: index + 1 })
        }
      >
        <SurfaceWash />
        {option.image && (
          <ImageWithFallback uri={option.image} testID={`option-image-${option.id}`} style={styles.optionImage} fallbackIconSize={22} />
        )}
        {option.text && (
          <Text
            style={styles.optionText}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {option.text[language]}
          </Text>
        )}
        {highlight === 'correct' && (
          <Animated.View testID={`option-mark-${option.id}`} style={[styles.correctMark, markEntranceStyle]}>
            <Text style={styles.markText}>✓</Text>
          </Animated.View>
        )}
        {highlight === 'incorrect' && (
          <Animated.View testID={`option-mark-${option.id}`} style={[styles.incorrectMark, markEntranceStyle]}>
            <Text style={styles.markText}>✕</Text>
          </Animated.View>
        )}
      </AnimatedPressable>
    );
  }

  return (
    <ScrollView
      style={styles.scrollView}
      // The flex column below is sized to fit a real landscape screen without
      // scrolling in the normal case. This ScrollView is the safety net for
      // when it can't: questionCard/grid carry a minHeight (70/140), so on an
      // unusually short screen they stop shrinking and the content container
      // genuinely grows past the viewport instead of merely compressing
      // toward zero — at which point this actually scrolls, rather than
      // clipping content off-screen unreachably.
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.column}>
        {showProgress && (
          <View
            testID="quiz-progress"
            style={styles.progressRow}
            // The dots themselves stay plain, unlabeled decoration — simple
            // enough for a 2-4 year old to glance at without any digits on
            // screen. `accessible` collapses the whole row (and its child
            // dot Views) into ONE screen-reader-focusable node carrying this
            // label, so TalkBack/VoiceOver announces "Question 2 of 5" once
            // instead of reading out N separate, unlabeled dot views.
            accessible
            accessibilityRole="text"
            accessibilityLabel={tFormat('quizProgressLabel', language, {
              current: (currentIndex as number) + 1,
              total: totalQuestions as number,
            })}
          >
            {Array.from({ length: totalQuestions as number }).map((_, i) => (
              <Animated.View
                key={i}
                testID={`quiz-progress-dot-${i}`}
                style={[
                  styles.progressDot,
                  i < (currentIndex as number) && styles.progressDotDone,
                  i === currentIndex && styles.progressDotCurrent,
                  { transform: [{ scale: getDotScale(i) }] },
                ]}
              />
            ))}
          </View>
        )}

        {/* The question container's own visual recipe (border + elevation +
            SurfaceWash two-tone wash + rounded corners) mirrors
            design-system's RaisedCard exactly, but is built by hand here
            rather than rendering <RaisedCard> itself — see the top-of-file
            redesign comment for why (RaisedCard's static-panel path can't be
            asked to fill an exact flex-ratio share of this screen's height,
            which this card's flex:2 depends on). */}
        <View style={styles.questionCard}>
          <View style={styles.questionCardClip}>
            <SurfaceWash />
            {question.question.image && (
              <ImageWithFallback uri={question.question.image} testID="question-image" style={styles.questionImage} fallbackIconSize={40} />
            )}
            {question.question.text && (
              <Text style={styles.questionText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                {question.question.text[language]}
              </Text>
            )}
          </View>
        </View>

        <View testID="quiz-options-grid" style={styles.grid}>
          {rows.map((rowOptions, rowIndex) => (
            <View key={rowIndex} testID={`quiz-options-row-${rowIndex}`} style={styles.gridRow}>
              {renderOption(rowOptions[0], rowIndex * 2)}
              {renderOption(rowOptions[1], rowIndex * 2 + 1)}
            </View>
          ))}
        </View>

        {hasAnswered && (
          // A single overlay presents both the result and the next action —
          // rather than an inline footer row — so the child's attention goes
          // to one clear thing at a time instead of splitting it between the
          // answer grid and a row of text/buttons below it. Conditionally
          // MOUNTING the Modal (rather than always rendering it with
          // visible={hasAnswered}) is what actually keeps it out of the
          // query tree entirely before an answer is given — matches this
          // file's existing convention (the old feedback row used the same
          // `hasAnswered &&` guard).
          //
          // Not built on design-system's <CelebrationOverlay>: that
          // component's `title`/`message` shape has no place for the
          // separate correct-answer TEXT-AND/OR-IMAGE reveal block this
          // screen needs on a wrong pick, and its wash/testIDs aren't
          // pluggable from the outside (both files are read-only). It's
          // used as the reference for the shape (dimmed backdrop, springing
          // card, optional celebration bubble, message, 1-2 actions) and its
          // own building blocks are reused directly (SurfaceWash's
          // proportions via `surfaceWash` tokens, and the raised
          // primary/secondary buttons for Retry/Next) instead.
          <Modal visible transparent animationType="fade">
            <View style={styles.feedbackBackdrop}>
              <Animated.View testID="quiz-feedback" style={[styles.feedbackCard, elevation.level5, feedbackCardEntranceStyle]}>
                <View style={styles.feedbackCardClip}>
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    {/* Jade wash when correct, berry wash when incorrect —
                        design-system's error/success hues — using the same
                        light-wash/dark-wash proportions `surfaceWash` tokens
                        declare, so the card itself reinforces the outcome at
                        a glance (not just feedbackText's color). */}
                    <View
                      testID="feedback-wash-highlight"
                      style={[
                        styles.feedbackCardHighlight,
                        { backgroundColor: isCorrect ? colors.jade : colors.berry },
                      ]}
                    />
                    <View
                      testID="feedback-wash-shadow"
                      style={[
                        styles.feedbackCardShadow,
                        { backgroundColor: isCorrect ? colors.jadeDark : colors.berryDark },
                      ]}
                    />
                  </View>

                  {showCelebration && (
                    // Decorative only: pointerEvents="none" so it can never
                    // intercept a tap meant for Retry/Next underneath, and
                    // hidden from assistive tech since the feedbackText below
                    // ("Correct!"/quizCorrect) already announces the result —
                    // this is purely a visual flourish layered on top, not new
                    // information.
                    <Animated.View
                      testID="quiz-celebration"
                      pointerEvents="none"
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={[
                        styles.celebrationBubble,
                        { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
                      ]}
                    >
                      <Text style={styles.celebrationEmoji}>🎉</Text>
                      <Text style={styles.celebrationText} numberOfLines={1}>
                        {t('quizCelebration', language)}
                      </Text>
                    </Animated.View>
                  )}

                  <View style={styles.feedbackMessageRow}>
                    {isCorrect && <Text style={styles.feedbackEmoji}>🎉</Text>}
                    <Text
                      style={[
                        styles.feedbackText,
                        isCorrect ? styles.feedbackCorrectText : styles.feedbackIncorrectText,
                      ]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {isCorrect ? t('quizCorrect', language) : t(incorrectTextKey, language)}
                    </Text>
                  </View>

                  {showCorrectAnswerReveal && (
                    // Second, separate block — appended below the
                    // encouraging message above, never merged into that
                    // string itself, so quizIncorrectYoung/quizIncorrectOlder's
                    // own wording (and the "no leakage" test guarding it)
                    // stays exactly as before. Text-and/or-image aware: the
                    // label+text line only renders when there's text, the
                    // small image only renders when there's an image, and
                    // with both present they stack (text above image) same
                    // as this file's own question/option cards already do.
                    <View testID="quiz-correct-answer-reveal" style={styles.correctAnswerReveal}>
                      {correctAnswerText && (
                        <Text
                          testID="quiz-correct-answer-text"
                          style={styles.feedbackCorrectAnswerText}
                          numberOfLines={2}
                          adjustsFontSizeToFit
                          minimumFontScale={0.75}
                        >
                          {`${t('quizCorrectAnswerLabel', language)} ${correctAnswerText}`}
                        </Text>
                      )}
                      {correctAnswerImage && (
                        <ImageWithFallback
                          uri={correctAnswerImage}
                          testID="quiz-correct-answer-image"
                          style={styles.correctAnswerImage}
                          fallbackIconSize={22}
                        />
                      )}
                    </View>
                  )}

                  {/* Retry + Next together, whether correct or wrong: Retry
                      (calls onRetry — clears the selection only, never
                      scores, see the onRetry prop doc above) lets the child
                      replay this same question even after answering
                      correctly, purely for fun; Next always advances via the
                      single onNext/answerCurrentQuestion path, so a correct
                      Retry can never double-score. Built on design-system's
                      raised buttons (Paper ripple + accessibility + the
                      shared lift/press feedback) instead of bare Pressables. */}
                  <View style={styles.feedbackButtonGroup}>
                    <RaisedSecondaryButton
                      testID="quiz-retry-answer"
                      label={t('retry', language)}
                      onPress={onRetry}
                      size="compact"
                      color={quizPalette.accent}
                      accessibilityLabel={t('retry', language)}
                    />
                    <RaisedPrimaryButton
                      testID="quiz-next"
                      label={t('quizNext', language)}
                      onPress={onNext}
                      size="compact"
                      color={isCorrect ? colors.jade : quizPalette.accent}
                      accessibilityLabel={t('quizNext', language)}
                    />
                  </View>
                </View>
              </Animated.View>
            </View>
          </Modal>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.md,
  },
  column: {
    flex: 1,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginHorizontal: spacing.xxs / 2,
    backgroundColor: colors.disabledBg,
    borderWidth: 2,
    borderColor: colors.disabledBorder,
  },
  progressDotDone: {
    backgroundColor: colors.jade,
    borderColor: colors.jadeDark,
  },
  progressDotCurrent: {
    backgroundColor: quizPalette.accent,
    borderColor: quizPalette.accentDark,
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  // The question gets a smaller share of the flexed space than the answer
  // grid (2 vs 3) since it's a single card, while the grid has to fit 4.
  // minHeight (rather than flexBasis:0's implicit 0) is what actually makes
  // the ScrollView above a real safety net: without it, a flex:2 sibling can
  // shrink toward zero on a very short screen instead of ever exceeding the
  // viewport and triggering a scroll. `flex: 2` lives directly on this same
  // bordered/shadowed view (not one level removed) precisely so its single
  // flex:1 child (questionCardClip) below can actually fill it — see the
  // top-of-file redesign comment on why this isn't <RaisedCard>.
  questionCard: {
    flex: 2,
    minHeight: 70,
    borderRadius: radii.xl,
    borderWidth: 4,
    borderColor: quizPalette.accentDark,
    marginBottom: spacing.sm,
    ...elevation.level3,
  },
  // Holds the actual content + wash layers, clipped to the card's rounded
  // corners — split out from questionCard above purely so overflow:'hidden'
  // never lands on the same view as the border/shadow (iOS clips shadows
  // away if it shares a view with overflow:'hidden').
  questionCardClip: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: spacing.sm,
  },
  questionImage: {
    height: '100%',
    aspectRatio: 1,
    borderRadius: radii.md,
  },
  questionText: {
    flexShrink: 1,
    fontSize: typography.h2.fontSize,
    fontWeight: typography.h2.fontWeight,
    color: colors.ink,
    textAlign: 'center',
  },
  grid: {
    flex: 3,
    minHeight: 140,
    rowGap: spacing.xs,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    columnGap: spacing.xs,
  },
  // The Pressable's own hit box/layout slot — flex + a generous touch-target
  // minHeight, comfortably above the 48dp minimum since these are meant to
  // be big, confident targets for a 2-8 year old.
  optionSlot: {
    flex: 1,
    minHeight: touchTarget.comfortable,
  },
  // The tilting "face" (AnimatedPressable's innerStyle): flex:1 so it fills
  // optionSlot exactly (see the top-of-file note on why flex is threaded
  // explicitly at every level here instead of relying on RaisedCard).
  optionCard: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: radii.lg,
    borderWidth: 3,
    borderColor: colors.violetSoft,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
    columnGap: spacing.xs,
    overflow: 'hidden',
    ...elevation.level2,
  },
  optionCorrect: {
    borderColor: colors.jadeDark,
    backgroundColor: colors.jadeSoft,
  },
  optionIncorrect: {
    borderColor: colors.berryDark,
    backgroundColor: colors.berrySoft,
  },
  optionImage: {
    height: '100%',
    aspectRatio: 1,
    borderRadius: radii.md,
  },
  optionText: {
    flexShrink: 1,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.ink,
    textAlign: 'center',
  },
  correctMark: {
    position: 'absolute',
    top: spacing.xxs,
    right: spacing.xxs,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.jadeDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incorrectMark: {
    position: 'absolute',
    top: spacing.xxs,
    right: spacing.xxs,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.berryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  imageFallback: {
    backgroundColor: colors.disabledBg,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {},
  // Dark, plum-tinted, non-interactive backdrop (no onPress — a child must
  // use Retry or Next, not a tap-outside dismiss) behind the centered
  // feedback card — design-system's `overlayScrim` instead of flat black.
  feedbackBackdrop: {
    flex: 1,
    backgroundColor: colors.overlayScrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  // Outer wrapper: pop-in transform/opacity + border/shadow only — no
  // overflow:'hidden' here (same shadow-vs-clipping split as questionCard/
  // questionCardClip above).
  feedbackCard: {
    borderRadius: radii.xl,
    maxWidth: 440,
    width: '100%',
  },
  // Holds the actual content + the two-tone wash, clipped to the card's
  // rounded corners.
  feedbackCardClip: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    overflow: 'hidden',
    padding: spacing.lg,
    alignItems: 'center',
  },
  // Light wash over the top ~55%, darker wash under the bottom ~45% — the
  // same proportions design-system's `surfaceWash` tokens declare, just
  // recolored per-result (jade for correct, berry for incorrect) inline
  // where these are used, since the color itself carries meaning here
  // rather than being a fixed brand tint.
  feedbackCardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: surfaceWash.highlightHeightPct,
    opacity: surfaceWash.highlightOpacity,
  },
  feedbackCardShadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: surfaceWash.shadowHeightPct,
    opacity: surfaceWash.shadowOpacity,
  },
  feedbackMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: spacing.sm,
    marginBottom: spacing.md,
  },
  feedbackEmoji: {
    fontSize: 22,
  },
  feedbackText: {
    flexShrink: 1,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    textAlign: 'center',
  },
  feedbackCorrectText: {
    color: colors.jadeDark,
  },
  feedbackIncorrectText: {
    color: colors.berryDark,
  },
  // Wraps the whole correct-answer reveal (wrong-answer path only) —
  // carries the marginBottom before Retry/Next so it's present whether this
  // renders text, an image, or both (rather than living on the text style
  // alone, which would vanish for an image-only correct option).
  correctAnswerReveal: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  // The correct-answer reveal's text line — deliberately plainer/smaller
  // than feedbackText above (no bold accent color) so the encouraging
  // message stays the visual focus and this reads as supporting
  // information underneath it, not a second competing headline.
  feedbackCorrectAnswerText: {
    flexShrink: 1,
    fontSize: typography.body.fontSize,
    color: colors.ink,
    textAlign: 'center',
  },
  // A small preview, not a full answer-grid-sized image — this is
  // supporting confirmation, not a second answer option to consider.
  correctAnswerImage: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    marginTop: spacing.xs,
  },
  feedbackButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.sm,
    marginTop: spacing.xs,
  },
  // A normal flex child (not absolutely positioned) — it lives inside the
  // feedback card, above the message/buttons, rather than floating over the
  // question card separately. pointerEvents "none" (set on the component)
  // still means it can never block a tap on Retry/Next below it.
  celebrationBubble: {
    backgroundColor: colors.lemon,
    borderRadius: radii.xl,
    borderWidth: 3,
    borderColor: colors.lemonDark,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  celebrationEmoji: {
    fontSize: 26,
  },
  celebrationText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.ink,
  },
});
