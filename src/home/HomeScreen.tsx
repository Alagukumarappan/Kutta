import React from 'react';
import { View, Text, Pressable, Image, StyleSheet, useWindowDimensions, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { resolveProfilePictureUri } from '../storage/profilePicture';
import { colors, radii, spacing, shadow, clamp } from '../theme/tokens';

// Fixed size of the optional avatar (image or fallback initial) shown next
// to the greeting. Deliberately small: greetingBadge's own padding
// (spacing.xs = 4 per side) plus this size must stay comfortably under
// SETTINGS_BUTTON_SIZE (44) below, since headerReserve derives the whole
// header row's reserved height from that one constant — a taller badge
// would silently make headerReserve wrong and risk the card grid
// overflowing a short screen (e.g. Galaxy S22 landscape).
const AVATAR_SIZE = 28;

export type HomeDestination = 'coloring' | 'quiz' | 'puzzle' | 'video' | 'settings';

type CardSpec = {
  testID: string;
  destination: HomeDestination;
  labelKey: 'homeColoring' | 'homeQuiz' | 'homePuzzle' | 'homeVideo';
  emoji: string;
  bg: string;
  border: string;
};

// Matches settingsButton's width/height below — pulled out as a constant so
// the headerReserve math in HomeScreen can derive from it instead of
// duplicating (or drifting from) the literal 44 in the stylesheet.
const SETTINGS_BUTTON_SIZE = 44;

const CARDS: CardSpec[] = [
  { testID: 'home-card-coloring', destination: 'coloring', labelKey: 'homeColoring', emoji: '🎨', bg: colors.pink, border: colors.pinkDark },
  { testID: 'home-card-quiz', destination: 'quiz', labelKey: 'homeQuiz', emoji: '🧠', bg: colors.periwinkle, border: colors.periwinkleDark },
  { testID: 'home-card-puzzle', destination: 'puzzle', labelKey: 'homePuzzle', emoji: '🧩', bg: colors.mint, border: colors.mintDark },
  { testID: 'home-card-video', destination: 'video', labelKey: 'homeVideo', emoji: '🎬', bg: colors.orange, border: colors.orangeDark },
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

  // One persistent Animated.Value per card, keyed by testID (not array
  // index) so it stays correctly matched to its card even if CARDS is ever
  // reordered. Purely a decorative press-feedback transform — created once
  // via useRef so identity is stable across re-renders, matching the
  // `scaleAnim`/`opacityAnim` convention QuestionRenderer's celebration
  // animation already established (iteration 17) rather than re-creating a
  // fresh Animated.Value on every render.
  const cardScales = React.useRef(
    Object.fromEntries(CARDS.map((card) => [card.testID, new Animated.Value(1)])) as Record<string, Animated.Value>
  ).current;

  // Any in-flight per-card animation, so it can be stopped on unmount below
  // instead of left running. This can't cause a setState-after-unmount
  // warning either way (it's a bare Animated.Value, not React state), but an
  // in-flight spring left to finish on its own keeps its native-driver frame
  // callbacks alive for a little while after the screen is gone — stopping
  // it explicitly is the cleaner, fully-self-contained behavior, and (in
  // Jest specifically) avoids one running test's still-settling spring
  // spilling stray native-driver ticks into whatever the *next* test renders.
  const activeAnimationsRef = React.useRef<Record<string, Animated.CompositeAnimation>>({});

  function animateCard(testID: string, toValue: number) {
    // Brief, native-driven spring — only ever changes `transform`, so it
    // never touches layout size (no reflow, no S22 screen-fit risk).
    const animation = Animated.spring(cardScales[testID], {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    });
    activeAnimationsRef.current[testID] = animation;
    animation.start();
  }

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
      Object.values(activeAnimationsRef.current).forEach((animation) => animation.stop());
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
  // single row instead of a 2x2 stack. Size them from the actual window
  // rather than a fixed pixel size, and cap the height so the row never
  // outgrows a short screen (leaving room for the header above it).
  const availableWidth = width - insets.left - insets.right;
  const gap = spacing.md;
  const cardWidth = (availableWidth - spacing.md * 2 - gap * (CARDS.length - 1)) / CARDS.length;
  // Chrome above/below the card row: screen's top+bottom padding (spacing.md
  // each) plus the settings-icon row's fixed height (SETTINGS_BUTTON_SIZE)
  // plus its marginBottom (spacing.md) separating it from the card grid.
  const headerReserve = spacing.md * 3 + SETTINGS_BUTTON_SIZE + insets.top + insets.bottom;
  const cardHeight = clamp(height - headerReserve, 120, 220);

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
          <Text style={styles.greetingText}>
            Hi, <Text testID="home-child-name" style={styles.greetingName}>{childName}</Text>! 👋
          </Text>
        </View>

        <Pressable
          testID="home-settings-icon"
          onPress={() => onNavigate('settings')}
          style={styles.settingsButton}
          accessibilityRole="button"
          accessibilityLabel={t('settingsTitle')}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {CARDS.map((card) => (
          <Pressable
            key={card.testID}
            testID={card.testID}
            onPress={() => handleCardPress(card)}
            onPressIn={() => animateCard(card.testID, 0.95)}
            onPressOut={() => animateCard(card.testID, 1)}
            style={[
              styles.card,
              { width: cardWidth, height: cardHeight, backgroundColor: card.bg, borderColor: card.border },
            ]}
          >
            <Animated.View
              style={[styles.cardInner, { transform: [{ scale: cardScales[card.testID] }] }]}
            >
              <Text style={styles.cardEmoji}>{card.emoji}</Text>
              <Text style={styles.cardLabel}>{t(card.labelKey)}</Text>
            </Animated.View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    // Base padding; the actual per-side padding used at render time also
    // adds this screen's safe-area insets (see the inline style override in
    // the component) since this is the one screen with no native header.
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  greetingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.sun,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    ...shadow,
    elevation: 2,
  },
  greetingText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  greetingName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  // Shared by both the real avatar <Image> and its fallback <View> so the
  // badge's height never changes between the two states (kept well under
  // the SETTINGS_BUTTON_SIZE-derived header budget, see AVATAR_SIZE above).
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    marginRight: spacing.xs,
  },
  avatarPlaceholder: {
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.ink,
  },
  settingsButton: {
    width: SETTINGS_BUTTON_SIZE,
    height: SETTINGS_BUTTON_SIZE,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    elevation: 3,
  },
  settingsIcon: {
    fontSize: 22,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    ...shadow,
    elevation: 4,
  },
  // Wraps the card's visible content only (not the Pressable itself), so the
  // press-in/press-out scale transform above never changes the Pressable's
  // own layout box/hit area — purely a visual "squish" of what's inside it.
  cardInner: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmoji: {
    fontSize: 52,
    marginBottom: spacing.sm,
  },
  cardLabel: {
    fontSize: 19,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
  },
});
