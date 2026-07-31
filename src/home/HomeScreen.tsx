import React from 'react';
import { View, Text, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export type HomeDestination = 'coloring' | 'quiz' | 'puzzle' | 'video' | 'settings';

type CardSpec = {
  testID: string;
  destination: HomeDestination;
  labelKey: 'homeColoring' | 'homeQuiz' | 'homePuzzle' | 'homeVideo';
  taglineKey: 'homeColoringTagline' | 'homeQuizTagline' | 'homePuzzleTagline' | 'homeVideoTagline';
  emoji: string;
  activity: ActivityId;
  // The one card given extra width in the grid below — see the `grid`
  // layout comment for why an asymmetrical "hero + three" composition was
  // chosen over four identical rectangles.
  hero?: boolean;
};

// Matches settingsButton's width/height below — pulled out as a constant so
// the headerReserve math in HomeScreen can derive from it instead of
// duplicating (or drifting from) the literal in the stylesheet. Uses the new
// design system's `touchTarget.iconButton` (48dp, Material's minimum) rather
// than the old theme's 44px.
const SETTINGS_BUTTON_SIZE = touchTarget.iconButton;

// Per-activity accent comes from the shared design system's
// `getActivityPalette()` (Coloring -> bubblegum, Quiz -> violet, Puzzle ->
// jade, Video -> marigold) rather than hand-picked colors, so Home stays in
// sync with any future screen that also colors itself by activity.
const CARDS: CardSpec[] = [
  { testID: 'home-card-coloring', destination: 'coloring', labelKey: 'homeColoring', taglineKey: 'homeColoringTagline', emoji: '🎨', activity: 'coloring', hero: true },
  { testID: 'home-card-quiz', destination: 'quiz', labelKey: 'homeQuiz', taglineKey: 'homeQuizTagline', emoji: '🧠', activity: 'quiz' },
  { testID: 'home-card-puzzle', destination: 'puzzle', labelKey: 'homePuzzle', taglineKey: 'homePuzzleTagline', emoji: '🧩', activity: 'puzzle' },
  { testID: 'home-card-video', destination: 'video', labelKey: 'homeVideo', taglineKey: 'homeVideoTagline', emoji: '🎬', activity: 'video' },
];

export function HomeScreen({
  childName,
  pictureUri,
  onNavigate,
}: {
  childName: string;
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

  // Landscape gives ample width and limited height, so the 4 cards sit in a
  // single row instead of a 2x2 stack (unchanged from before). What changes
  // is the row's composition: rather than four identical rectangles, the
  // first (Coloring) card is given extra flex weight as a "hero" tile, with
  // the remaining three sharing the rest — an asymmetrical grid that still
  // fits the exact same height budget and screen-fit math as before (no
  // extra chrome height added), just a different width split.
  const availableWidth = width - insets.left - insets.right;
  const gap = spacing.md;
  // Chrome above/below the card row: screen's top+bottom padding (spacing.md
  // each) plus the settings-icon row's fixed height (SETTINGS_BUTTON_SIZE)
  // plus its marginBottom (spacing.md) separating it from the card grid.
  const headerReserve = spacing.md * 3 + SETTINGS_BUTTON_SIZE + insets.top + insets.bottom;
  const cardHeight = clamp(height - headerReserve, 120, 220);
  const HERO_WEIGHT = 1.35;
  const totalWeight = CARDS.reduce((sum, card) => sum + (card.hero ? HERO_WEIGHT : 1), 0);
  const usableWidth = availableWidth - gap * (CARDS.length - 1);

  return (
    <View
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
          low-opacity tinted circles bleeding off the edges of the screen, so
          the background reads as layered rather than a single flat color.
          pointerEvents="none" so they can never intercept a child's tap. */}
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
            <Text style={styles.greetingHi}>{t('homeGreetingHi')}</Text>
            <Text style={styles.greetingText}>
              <Text testID="home-child-name" style={styles.greetingName}>{childName}</Text>! 👋
            </Text>
          </View>
        </View>

        <AnimatedPressable
          testID="home-settings-icon"
          onPress={() => onNavigate('settings')}
          tilt="compact"
          style={styles.settingsHitArea}
          innerStyle={styles.settingsButton}
          accessibilityRole="button"
          accessibilityLabel={t('settingsTitle')}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </AnimatedPressable>
      </View>

      <View style={styles.grid}>
        {CARDS.map((card, index) => {
          const palette = getActivityPalette(card.activity);
          const weight = card.hero ? HERO_WEIGHT : 1;
          const cardWidth = (usableWidth * weight) / totalWeight;
          return (
            <View
              key={card.testID}
              style={{
                width: cardWidth,
                height: cardHeight,
                marginRight: index < CARDS.length - 1 ? gap : 0,
              }}
            >
              <RaisedCard
                testID={card.testID}
                onPress={() => handleCardPress(card)}
                color={palette.accent}
                borderColor={palette.accentDark}
                elevationLevel="level3"
                tilt="regular"
                accessibilityLabel={t(card.labelKey)}
                style={styles.cardFill}
              >
                <View style={styles.cardContent}>
                  <View style={[styles.emojiBadge, card.hero && styles.emojiBadgeHero]}>
                    <Text style={[styles.cardEmoji, card.hero && styles.cardEmojiHero]}>{card.emoji}</Text>
                  </View>
                  <Text style={[styles.cardLabel, card.hero && styles.cardLabelHero]}>{t(card.labelKey)}</Text>
                  {card.hero && <Text style={styles.cardTagline}>{t(card.taglineKey)}</Text>}
                </View>
              </RaisedCard>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
    overflow: 'hidden',
    // Base padding; the actual per-side padding used at render time also
    // adds this screen's safe-area insets (see the inline style override in
    // the component) since this is the one screen with no native header.
  },
  decorTopRight: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.violetSoft,
    opacity: 0.6,
  },
  decorBottomLeft: {
    position: 'absolute',
    bottom: -70,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.marigoldSoft,
    opacity: 0.5,
  },
  decorMid: {
    position: 'absolute',
    top: '30%',
    left: '38%',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.jadeSoft,
    opacity: 0.35,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  greetingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    ...elevation.level2,
  },
  greetingHi: {
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    color: colors.inkMuted,
  },
  greetingText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.ink,
  },
  greetingName: {
    fontSize: typography.body.fontSize,
    fontWeight: '800',
    color: colors.bubblegumDark,
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
  // — sized to the full SETTINGS_BUTTON_SIZE so the tappable area itself
  // never shrinks or shifts as the inner face tilts.
  settingsHitArea: {
    width: SETTINGS_BUTTON_SIZE,
    height: SETTINGS_BUTTON_SIZE,
  },
  settingsButton: {
    width: SETTINGS_BUTTON_SIZE,
    height: SETTINGS_BUTTON_SIZE,
    borderRadius: SETTINGS_BUTTON_SIZE / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.level3,
  },
  settingsIcon: {
    fontSize: 22,
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
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
    // Same white-over-color translucent badge trick as CardBackground's own
    // wash, expressed via the shared `withAlpha` helper (design-system/
    // tokens.ts) instead of a hand-typed rgba() literal so this stays a
    // single, documented color-math implementation across the app.
    backgroundColor: withAlpha(colors.white, 0.35),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emojiBadgeHero: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  cardEmoji: {
    fontSize: 36,
  },
  cardEmojiHero: {
    fontSize: 44,
  },
  cardLabel: {
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.white,
    textAlign: 'center',
  },
  cardLabelHero: {
    fontSize: typography.h2.fontSize,
    fontWeight: typography.h2.fontWeight,
  },
  cardTagline: {
    marginTop: spacing.xxs,
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
    color: withAlpha(colors.white, 0.85),
    textAlign: 'center',
  },
});
