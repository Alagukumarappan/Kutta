import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { HomeScreen } from '../../src/home/HomeScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as profilePicture from '../../src/storage/profilePicture';

jest.mock('../../src/storage/profilePicture');

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no picture set / nothing resolves — matches most profiles
    // (this app's data-layer field is optional, see Profile.pictureUri).
    // Individual tests below override this to exercise the "set" and
    // "resolves to null (missing file)" paths.
    (profilePicture.resolveProfilePictureUri as jest.Mock).mockResolvedValue(null);
  });

  it('shows the child name and all four feature cards', async () => {
    const onNavigate = jest.fn();
    const { getByText } = await render(
      <LanguageProvider initialLanguage="en">
        <HomeScreen childName="Sam" onNavigate={onNavigate} />
      </LanguageProvider>
    );

    expect(getByText('Sam')).toBeTruthy();

    await fireEvent.press(getByText('Coloring'));
    expect(onNavigate).toHaveBeenCalledWith('coloring');

    await fireEvent.press(getByText('Quiz'));
    expect(onNavigate).toHaveBeenCalledWith('quiz');

    await fireEvent.press(getByText('Photo Puzzle'));
    expect(onNavigate).toHaveBeenCalledWith('puzzle');

    await fireEvent.press(getByText('Videos'));
    expect(onNavigate).toHaveBeenCalledWith('video');
  });

  it('exposes the settings icon button to screen readers with an accessible name', async () => {
    const onNavigate = jest.fn();
    const { findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <HomeScreen childName="Sam" onNavigate={onNavigate} />
      </LanguageProvider>
    );

    const settingsButton = await findByLabelText('Settings');
    await fireEvent.press(settingsButton);
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });

  describe('card press animation / navigation safety', () => {
    it('still navigates immediately on a normal press, unaffected by the press-in/press-out animation', async () => {
      const onNavigate = jest.fn();
      const { getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <HomeScreen childName="Sam" onNavigate={onNavigate} />
        </LanguageProvider>
      );

      const card = getByTestId('home-card-quiz');
      // In HomeScreen.tsx, onPress is wired directly to handleCardPress —
      // it does not await, chain off, or otherwise depend on the
      // onPressIn/onPressOut-triggered scale animation in any way (confirmed
      // by reading the component: animateCard and handleCardPress are two
      // entirely separate callbacks passed to two separate Pressable props).
      // A dedicated test that manually fires raw 'pressIn'/'pressOut' events
      // (to simulate a real touch's pressIn->press->pressOut sequence) was
      // tried here, but doing so starts a real native-driver Animated.spring
      // with no native module backing it under Jest, which left the test
      // renderer in a corrupted state that broke unrelated later tests in
      // this file (matching this codebase's established convention, per
      // QuestionRenderer.test.tsx's celebration tests, of never directly
      // driving/asserting on Animated values in tests) — so this test
      // sticks to a plain press, which is sufficient together with the code
      // reading above to confirm navigation isn't gated by the animation.
      await fireEvent.press(card);

      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith('quiz');
    });

    it('guards a rapid double-tap on the same card against double navigation', async () => {
      const onNavigate = jest.fn();
      const { getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <HomeScreen childName="Sam" onNavigate={onNavigate} />
        </LanguageProvider>
      );

      // Press the SAME captured element twice without re-querying, the same
      // "stale double-tap" shape used elsewhere in this codebase's
      // double-fire guards (e.g. QuizScreen's Play Again) — without a guard
      // this would call onNavigate twice.
      const card = getByTestId('home-card-coloring');
      await fireEvent.press(card);
      await fireEvent.press(card);

      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith('coloring');
    });

    it('does NOT block a different card from navigating right after another card was pressed (the guard is per-card, not shared)', async () => {
      // The guard is deliberately scoped per-card, not shared across all
      // four: tapping several different cards in quick succession (e.g. a
      // child changing their mind, or the pre-existing "all four cards"
      // test above) is a genuinely different action each time, not a
      // duplicate of the same one, and must keep working exactly like the
      // pre-existing multi-card test above.
      const onNavigate = jest.fn();
      const { getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <HomeScreen childName="Sam" onNavigate={onNavigate} />
        </LanguageProvider>
      );

      await fireEvent.press(getByTestId('home-card-coloring'));
      await fireEvent.press(getByTestId('home-card-quiz'));

      expect(onNavigate).toHaveBeenCalledTimes(2);
      expect(onNavigate).toHaveBeenNthCalledWith(1, 'coloring');
      expect(onNavigate).toHaveBeenNthCalledWith(2, 'quiz');
    });
  });

  describe('profile picture avatar', () => {
    it('shows a fallback placeholder avatar (not a broken image) when no picture is set', async () => {
      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <HomeScreen childName="Sam" onNavigate={jest.fn()} />
        </LanguageProvider>
      );

      expect(await findByTestId('home-avatar-placeholder')).toBeTruthy();
      expect(queryByTestId('home-avatar-image')).toBeNull();
    });

    it('shows the resolved picture when Profile.pictureUri resolves to a real, still-existing file', async () => {
      (profilePicture.resolveProfilePictureUri as jest.Mock).mockResolvedValue('content://tree/pictures/me.jpg');

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <HomeScreen childName="Sam" pictureUri="content://tree/pictures/me.jpg" onNavigate={jest.fn()} />
        </LanguageProvider>
      );

      const image = await findByTestId('home-avatar-image');
      expect(image.props.source).toEqual({ uri: 'content://tree/pictures/me.jpg' });
      expect(queryByTestId('home-avatar-placeholder')).toBeNull();
    });

    it('falls back to the placeholder when the picture file has gone missing (resolveProfilePictureUri returns null)', async () => {
      (profilePicture.resolveProfilePictureUri as jest.Mock).mockResolvedValue(null);

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <HomeScreen childName="Sam" pictureUri="content://tree/pictures/deleted.jpg" onNavigate={jest.fn()} />
        </LanguageProvider>
      );

      expect(await findByTestId('home-avatar-placeholder')).toBeTruthy();
      expect(queryByTestId('home-avatar-image')).toBeNull();
    });

    it('falls back to the placeholder if the resolved image itself fails to load (onError)', async () => {
      (profilePicture.resolveProfilePictureUri as jest.Mock).mockResolvedValue('content://tree/pictures/me.jpg');

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <HomeScreen childName="Sam" pictureUri="content://tree/pictures/me.jpg" onNavigate={jest.fn()} />
        </LanguageProvider>
      );

      const image = await findByTestId('home-avatar-image');
      await act(async () => {
        image.props.onError();
      });

      expect(await findByTestId('home-avatar-placeholder')).toBeTruthy();
      expect(queryByTestId('home-avatar-image')).toBeNull();
    });

    it('gives the avatar (image or placeholder) an accessible label for screen readers, and it is not tappable', async () => {
      const { findByLabelText } = await render(
        <LanguageProvider initialLanguage="en">
          <HomeScreen childName="Sam" onNavigate={jest.fn()} />
        </LanguageProvider>
      );

      const placeholder = await findByLabelText('No profile picture set');
      // Decorative-only: no onPress handler, so a tap does nothing (this
      // just documents the "not a Pressable" contract rather than needing
      // to fire an event and assert an absence of a callback).
      expect(placeholder.props.onPress).toBeUndefined();
    });

    it('re-resolves the avatar when pictureUri changes to a different profile picture', async () => {
      (profilePicture.resolveProfilePictureUri as jest.Mock).mockResolvedValue('content://tree/pictures/first.jpg');

      const { findByTestId, rerender } = await render(
        <LanguageProvider initialLanguage="en">
          <HomeScreen childName="Sam" pictureUri="content://tree/pictures/first.jpg" onNavigate={jest.fn()} />
        </LanguageProvider>
      );

      let image = await findByTestId('home-avatar-image');
      expect(image.props.source).toEqual({ uri: 'content://tree/pictures/first.jpg' });

      (profilePicture.resolveProfilePictureUri as jest.Mock).mockResolvedValue('content://tree/pictures/second.jpg');
      rerender(
        <LanguageProvider initialLanguage="en">
          <HomeScreen childName="Sam" pictureUri="content://tree/pictures/second.jpg" onNavigate={jest.fn()} />
        </LanguageProvider>
      );

      await waitFor(async () => {
        image = await findByTestId('home-avatar-image');
        expect(image.props.source).toEqual({ uri: 'content://tree/pictures/second.jpg' });
      });
    });
  });
});
