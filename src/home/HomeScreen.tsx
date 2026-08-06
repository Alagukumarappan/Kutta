import React from 'react';
import { View, Text, Image, Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { resolveProfilePictureUri } from '../storage/profilePicture';
import {
  colors,
  radii,
  spacing,
  typography,
  elevation,
  touchTarget,
  clamp,
  withAlpha,
  getActivityPalette,
  type ActivityId,
  RaisedCard,
  AnimatedPressable,
} from '../design-system';

// Fixed size of the optional avatar (image or fallback initial) shown next
// to the greeting. Deliberately small: greetingBadge's own padding
// (spacing.xs per side) plus this size must stay comfortably under
// SETTINGS_BUTTON_SIZE below, since headerReserve derives the whole header
// row's reserved height from that one constant — a taller badge would
// silently make headerReserve wrong and risk the card grid overflowing a
// short screen (e.g. Galaxy S22 landscape).
const AVATAR_SIZE = 36;

export type HomeDestination = 'coloring' | 'quiz' | 'puzzle' | 'video' | 'tictactoe' | 'settings';

type CardSpec = {
  testID: string;
  destination: HomeDestination;
  labelKey: 'homeColoring' | 'homeQuiz' | 'homePuzzle' | 'homeVideo' | 'homeTicTacToe';
  taglineKey:
    | 'homeColoringTagline'
    | 'homeQuizTagline'
    | 'homePuzzleTagline'
    | 'homeVideoTagline'
    | 'homeTicTacToeTagline';
  emoji: string;
  activity: ActivityId;
};

// Matches settingsButton's HEIGHT below (the settings control is now a wider
// pill, not a square icon button, so only its height stays tied to this
// constant) — pulled out so the headerReserve math in HomeScreen can derive
// from it instead of duplicating (or drifting from) the literal in the
// stylesheet. Uses the new design system's `touchTarget.iconButton` (48dp,
// Material's minimum) rather than the old theme's 44px.
const SETTINGS_BUTTON_SIZE = touchTarget.iconButton;

// Fixed width for the settings pill (icon + "Settings" label). A generous
// fixed value rather than shrink-to-fit content, so the German label
// ("Einstellungen", noticeably longer than "Settings") never forces a
// last-minute layout jump between languages.
const SETTINGS_PILL_WIDTH = 148;

// A horizontally-scrolling row (not a fixed 4-up grid) so more activity
// cards can be added later without ever needing to shrink existing ones to
// make room — each card keeps a comfortable, constant size regardless of
// how many siblings it has. CARD_GAP/SIDE_PADDING both feed into the
// snap-scroll math below, so they're shared constants rather than
// independent style literals.
const CARD_GAP = spacing.md;
const SIDE_PADDING = spacing.md;

// Per-activity accent comes from the shared design system's
// `getActivityPalette()` (Coloring -> bubblegum, Quiz -> violet, Puzzle ->
// jade, Video -> marigold) rather than hand-picked colors, so Home stays in
// sync with any future screen that also colors itself by activity.
const CARDS: CardSpec[] = [
  { testID: 'home-card-coloring', destination: 'coloring', labelKey: 'homeColoring', taglineKey: 'homeColoringTagline', emoji: '🎨', activity: 'coloring' },
  { testID: 'home-card-quiz', destination: 'quiz', labelKey: 'homeQuiz', taglineKey: 'homeQuizTagline', emoji: '🧠', activity: 'quiz' },
  { testID: 'home-card-puzzle', destination: 'puzzle', labelKey: 'homePuzzle', taglineKey: 'homePuzzleTagline', emoji: '🧩', activity: 'puzzle' },
  { testID: 'home-card-video', destination: 'video', labelKey: 'homeVideo', taglineKey: 'homeVideoTagline', emoji: '🎬', activity: 'video' },
  { testID: 'home-card-tictactoe', destination: 'tictactoe', labelKey: 'homeTicTacToe', taglineKey: 'homeTicTacToeTagline', emoji: '⭕', activity: 'tictactoe' },
];

export function HomeScreen({
  childName,
  childAge,
  pictureUri,
  onNavigate,
}: {
  childName: string;
  // Profile.age (2-8 inclusive) — always present on a saved Profile (see
  // src/types/profile.ts), shown as a small subtitle under the child's name
  // in the header pill below, matching this redesign's reference.
  childAge: number;
  // Raw Profile.pictureUri, resolved (existence-checked) below via
  // resolveProfilePictureUri — optional since most profiles won't have set
  // one (see SettingsScreen's picker, iteration 29).
  pictureUri?: string;
  onNavigate: (destination: HomeDestination) => void;
}) {
  const { t, language } = useLanguage();
  const { width, height } = useWindowDimensions();
  // Home is the one screen with headerShown:false (no native
  // header/navigation chrome doing this for us elsewhere), so it's the only
  // screen that has to account for the status bar / notch / gesture-nav bar
  // on all four sides itself.
  const insets = useSafeAreaInsets();

  // Resolved (existence-checked) picture uri, or null for "show the
  // fallback avatar" — covers both "never set" and "was set but the file
  // has since gone missing" (resolveProfilePictureUri never throws and
  // returns null for both). Also reset on every onError from the <Image>
  // itself below, for the rarer case where the file exists but fails to
  // actually decode/load.
  const [resolvedPictureUri, setResolvedPictureUri] = React.useState<string | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setAvatarLoadFailed(false);
    resolveProfilePictureUri(pictureUri).then((resolved) => {
      if (!cancelled) setResolvedPictureUri(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [pictureUri]);

  const showAvatarImage = resolvedPictureUri !== null && !avatarLoadFailed;

  // Home has no navigation-driven unmount to rely on (unlike e.g. the quiz's
  // "Home" button, which permanently leaves its screen instance) — React
  // Navigation's native stack keeps HomeScreen mounted underneath whatever
  // screen it pushes, so a rapid double-tap on the SAME card really could
  // fire onNavigate twice (and push the same route twice) before the first
  // navigation completes, same risk category as iteration 21's Play
  // Again/Home guards. The lock is deliberately keyed PER CARD (not one lock
  // shared across all four): the app already allows a child to tap several
  // different cards in quick succession — each is a genuinely separate,
  // intentional choice, not a duplicate of the same action — so only a
  // repeated tap on the same still-locked card is blocked. Each card's lock
  // re-arms itself a short moment later, well past any realistic double-tap
  // window but far short of any real "browsed a gallery and came back"
  // return trip, so a later, genuine return visit to Home can still navigate
  // normally.
  //
  // The press-in/press-out tilt/lift/scale itself is no longer hand-rolled
  // here — RaisedCard (via AnimatedPressable/useTiltPress) owns that
  // animation and its own unmount cleanup now, so this component only needs
  // to guard navigation, not animation state.
  const navLockRef = React.useRef<Record<string, boolean>>({});
  // Every re-arm timer this instance has scheduled, so it can be cancelled on
  // unmount below — without this, a timer from one rendered instance (e.g. a
  // previous test's) could still fire after that instance is gone, which is
  // harmless in the app itself (it only flips a plain ref, not React state,
  // so it can't cause a setState-after-unmount warning) but is exactly the
  // kind of stray pending timer that's worth not leaving behind regardless.
  const rearmTimeoutsRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  React.useEffect(() => {
    return () => {
      rearmTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  function handleCardPress(card: CardSpec) {
    if (navLockRef.current[card.testID]) return;
    navLockRef.current[card.testID] = true;
    onNavigate(card.destination);
    const timeoutId = setTimeout(() => {
      navLockRef.current[card.testID] = false;
    }, 800);
    rearmTimeoutsRef.current.push(timeoutId);
  }

  // Every card above goes through handleCardPress's navLockRef guard, but
  // the settings icon called onNavigate('settings') directly, with no guard
  // at all — Home stays mounted underneath a pushed screen (see this file's
  // own comment on why cards need this guard in the first place), so a
  // rapid double-tap on the gear could push Settings twice. Reuses the same
  // navLockRef record (a distinct 'settings-icon' key, so it can never collide
  // with a card's own testID) rather than a separate ref, since the guard
  // logic itself is identical.
  const SETTINGS_NAV_LOCK_KEY = 'settings-icon';
  function handleSettingsPress() {
    if (navLockRef.current[SETTINGS_NAV_LOCK_KEY]) return;
    navLockRef.current[SETTINGS_NAV_LOCK_KEY] = true;
    onNavigate('settings');
    const timeoutId = setTimeout(() => {
      navLockRef.current[SETTINGS_NAV_LOCK_KEY] = false;
    }, 800);
    rearmTimeoutsRef.current.push(timeoutId);
  }

  // Landscape gives ample width and limited height, so the row of cards
  // scrolls horizontally rather than stacking. CARD_WIDTH is a fixed
  // fraction of the screen (clamped to a sane range) rather than dividing
  // the full width by the card count — that's what lets more cards be added
  // later without shrinking the existing ones; the row just scrolls a
  // little further. Sized so a bit more than 3 cards are visible at once on
  // a typical landscape phone, with the next card peeking in at the edge as
  // a natural "there's more, keep scrolling" cue.
  const availableWidth = width - insets.left - insets.right;
  const CARD_WIDTH = clamp(availableWidth / 3.4, 150, 240);
  const headerReserve = spacing.md * 3 + SETTINGS_BUTTON_SIZE + insets.top + insets.bottom;
  const cardHeight = clamp(height - headerReserve, 140, 240);

  // Drives the scroll-linked focus effect below: the centered-ish card
  // scales/brightens up slightly while cards further from view ease back
  // down, the same "each card responds to where it sits in the row" feel
  // established children's/media apps use for horizontal rows — native
  // driver only (transform/opacity), so this costs nothing on the JS thread
  // while scrolling.
  const scrollX = React.useRef(new Animated.Value(0)).current;
  const step = CARD_WIDTH + CARD_GAP;

  return (
    <LinearGradient
      colors={[colors.violet, colors.violetDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.screen,
        {
          paddingTop: spacing.md + insets.top,
          paddingBottom: spacing.md + insets.bottom,
          paddingLeft: spacing.md + insets.left,
          paddingRight: spacing.md + insets.right,
        },
      ]}
    >
      {/* Purely decorative depth shapes behind everything — soft, static,
          low-opacity WHITE-translucent circles bleeding off the edges of the
          screen, so the rich purple gradient background reads as layered
          rather than a single flat fill. Re-tuned for this dark background:
          the old violet/marigold/jade soft tints (chosen for the previous
          cream `colors.canvas` background) would either disappear into the
          new purple or clash with it, so these are all one neutral white at
          a low, varying opacity instead. pointerEvents="none" so they can
          never intercept a child's tap. */}
      <View style={styles.decorTopRight} pointerEvents="none" />
      <View style={styles.decorBottomLeft} pointerEvents="none" />
      <View style={styles.decorMid} pointerEvents="none" />

      <View style={styles.header}>
        <View style={styles.greetingBadge}>
          {/* Decorative-only per this feature's own guidance (see
              PROGRESS.md's Next section for iteration 29): not wrapped in a
              Pressable, so a child can't accidentally trigger anything by
              tapping it — it's purely a visual identity cue. Still needs a
              real accessibilityLabel for screen readers either way. */}
          {showAvatarImage ? (
            <Image
              testID="home-avatar-image"
              source={{ uri: resolvedPictureUri as string }}
              style={styles.avatar}
              accessible
              accessibilityRole="image"
              accessibilityLabel={tFormat('homeProfilePictureLabel', language, { name: childName })}
              onError={() => setAvatarLoadFailed(true)}
            />
          ) : (
            <View
              testID="home-avatar-placeholder"
              style={[styles.avatar, styles.avatarPlaceholder]}
              accessible
              accessibilityRole="image"
              accessibilityLabel={t('homeProfilePicturePlaceholderLabel')}
            >
              <Text style={styles.avatarPlaceholderText}>{childName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View>
            <Text testID="home-child-name" style={styles.greetingName}>{childName}</Text>
            <Text style={styles.greetingAge}>{tFormat('homeAgeLabel', language, { age: childAge })}</Text>
          </View>
        </View>

        <AnimatedPressable
          testID="home-settings-icon"
          onPress={handleSettingsPress}
          tilt="compact"
          style={styles.settingsHitArea}
          innerStyle={styles.settingsButton}
          accessibilityRole="button"
          accessibilityLabel={t('settingsTitle')}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
          <Text style={styles.settingsLabel}>{t('settingsTitle')}</Text>
        </AnimatedPressable>
      </View>

      <Animated.ScrollView
        testID="home-card-row"
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={step}
        snapToAlignment="start"
        contentContainerStyle={[styles.gridContent, { paddingHorizontal: SIDE_PADDING }]}
        style={styles.grid}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
      >
        {CARDS.map((card, index) => {
          const palette = getActivityPalette(card.activity);
          const itemOffset = index * step;
          const inputRange = [itemOffset - step, itemOffset, itemOffset + step];
          const scale = scrollX.interpolate({ inputRange, outputRange: [0.92, 1, 0.92], extrapolate: 'clamp' });
          const focusOpacity = scrollX.interpolate({ inputRange, outputRange: [0.85, 1, 0.85], extrapolate: 'clamp' });
          return (
            <Animated.View
              key={card.testID}
              style={{
                width: CARD_WIDTH,
                height: cardHeight,
                marginRight: index < CARDS.length - 1 ? CARD_GAP : 0,
                transform: [{ scale }],
                opacity: focusOpacity,
              }}
            >
              {/* White card face, per this redesign's reference — the
                  per-activity accent now lives on the icon frame below
                  instead of the whole card face, so `borderColor` is a
                  soft neutral line rather than the accent's dark shade. */}
              <RaisedCard
                testID={card.testID}
                onPress={() => handleCardPress(card)}
                color={colors.surface}
                borderColor={colors.line}
                elevationLevel="level3"
                tilt="regular"
                accessibilityLabel={t(card.labelKey)}
                style={styles.cardFill}
              >
                <View style={styles.cardContent}>
                  <View style={[styles.emojiBadge, { backgroundColor: palette.accent }]}>
                    <Text style={styles.cardEmoji}>{card.emoji}</Text>
                  </View>
                  <Text style={styles.cardLabel}>{t(card.labelKey)}</Text>
                  <Text style={styles.cardTagline}>{t(card.taglineKey)}</Text>
                </View>
              </RaisedCard>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    // Background is now the LinearGradient element itself (colors.violet ->
    // colors.violetDark, see the component above) rather than a flat
    // `backgroundColor` here — this style object only supplies layout
    // (flex/overflow) plus the safe-area-aware padding merged in at render
    // time (see the inline style override in the component) since this is
    // the one screen with no native header.
  },
  decorTopRight: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.white,
    opacity: 0.1,
  },
  decorBottomLeft: {
    position: 'absolute',
    bottom: -70,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.white,
    opacity: 0.08,
  },
  decorMid: {
    position: 'absolute',
    top: '30%',
    left: '38%',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.white,
    opacity: 0.06,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: SIDE_PADDING,
  },
  // The darker navy-purple header pill from this redesign's reference —
  // deliberately reuses `colors.violetDark` (already a close match, see
  // REDESIGN_PROGRESS.md's palette) rather than inventing a new hex, plus a
  // stronger shadow so it visibly lifts off the lighter gradient behind it.
  greetingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.violetDark,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...elevation.level3,
  },
  greetingName: {
    fontSize: typography.body.fontSize,
    fontWeight: '800',
    color: colors.white,
  },
  // Age subtitle under the name — a translucent white rather than a fixed
  // lighter hex, so it stays readable against `greetingBadge`'s dark fill
  // without needing its own dedicated color token.
  greetingAge: {
    marginTop: spacing.xxs / 2,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    color: withAlpha(colors.white, 0.75),
  },
  // Shared by both the real avatar <Image> and its fallback <View> so the
  // badge's height never changes between the two states (kept well under
  // the SETTINGS_BUTTON_SIZE-derived header budget, see AVATAR_SIZE above).
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    marginRight: spacing.sm,
  },
  avatarPlaceholder: {
    backgroundColor: colors.violetSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: typography.body.fontSize,
    fontWeight: 'bold',
    color: colors.violetDark,
  },
  // AnimatedPressable's outer Pressable (layout/hit-area only, matching the
  // "outer never animates" convention every design-system pressable shares)
  // — sized to a fixed pill (SETTINGS_PILL_WIDTH x SETTINGS_BUTTON_SIZE) so
  // the tappable area itself never shrinks or shifts as the inner face
  // tilts.
  settingsHitArea: {
    width: SETTINGS_PILL_WIDTH,
    height: SETTINGS_BUTTON_SIZE,
  },
  // Restyled as a white pill (icon + label), matching this redesign's
  // reference "For parents" button, rather than the previous small circular
  // icon-only button — same handleSettingsPress/double-tap-guard logic
  // above, this only changes the visual container.
  settingsButton: {
    width: SETTINGS_PILL_WIDTH,
    height: SETTINGS_BUTTON_SIZE,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    ...elevation.level3,
  },
  settingsIcon: {
    fontSize: 18,
    marginRight: spacing.xxs,
  },
  settingsLabel: {
    fontSize: typography.buttonSmall.fontSize,
    fontWeight: typography.buttonSmall.fontWeight,
    color: colors.ink,
  },
  grid: {
    flex: 1,
  },
  gridContent: {
    alignItems: 'center',
  },
  cardFill: {
    flex: 1,
  },
  cardContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  emojiBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    // backgroundColor is set per-card via `palette.accent` (see the render
    // above) — this redesign moves the per-activity accent from the whole
    // card face onto this icon frame instead, matching the reference's
    // "white card, colorful icon frame" look.
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  cardEmoji: {
    fontSize: 40,
  },
  cardLabel: {
    // Card face is now always white (see the render above), so the label
    // uses one fixed dark ink color rather than the old per-accent
    // `onAccentText` lookup that used to be needed when the accent filled
    // the whole card.
    color: colors.ink,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    textAlign: 'center',
  },
  cardTagline: {
    // Same reasoning as cardLabel above: white card face now, so a single
    // muted ink tone (rather than the old per-accent onAccentText) reads
    // well on every card regardless of its activity's accent color.
    color: colors.inkMuted,
    marginTop: spacing.xxs,
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
    textAlign: 'center',
  },
});
