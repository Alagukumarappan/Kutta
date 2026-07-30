// Manual mock for 'react-native-safe-area-context', auto-applied by Jest to
// every test in this project (no explicit jest.mock() call needed) because it
// lives at the project root's __mocks__/<module-name> path, same pattern as
// __mocks__/@react-native-async-storage/async-storage.ts.
//
// jest-expo's test environment has no native SafeAreaProvider host view, so
// the real library's useSafeAreaInsets()/useSafeAreaFrame() throw
// "No safe area value available" unless a <SafeAreaProvider> ancestor is
// rendered with resolved metrics - which most of this app's screen-level
// tests (e.g. PuzzleScreen.test.tsx) deliberately don't set up, since they
// render a single screen in isolation rather than the full navigation tree.
// Mirrors the fallback behavior of the library's own jest/mock.tsx: fall back
// to fixed zero insets/a fixed frame when there's no provider in the tree,
// but still honor a real ancestor <SafeAreaProvider> (e.g. in
// RootNavigator.test.tsx) when one is present, so tests can still exercise
// non-zero insets by supplying initialMetrics.
import React, { useContext } from 'react';

// This file is only ever loaded by Jest (as a CommonJS module, via its
// manual-mock convention), never bundled into the app, so `module` here is
// always the real Node/CommonJS global - but the project's tsconfig doesn't
// pull in @types/node, so tsc doesn't know that without this declaration.
declare const module: { exports: any };

const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_FRAME = { x: 0, y: 0, width: 320, height: 640 };

const actual = jest.requireActual('react-native-safe-area-context');

function SafeAreaProvider({ children, initialMetrics }: any) {
  return (
    <actual.SafeAreaFrameContext.Provider value={initialMetrics?.frame ?? DEFAULT_FRAME}>
      <actual.SafeAreaInsetsContext.Provider value={initialMetrics?.insets ?? ZERO_INSETS}>
        {children}
      </actual.SafeAreaInsetsContext.Provider>
    </actual.SafeAreaFrameContext.Provider>
  );
}

function useSafeAreaInsets() {
  return useContext(actual.SafeAreaInsetsContext) ?? ZERO_INSETS;
}

function useSafeAreaFrame() {
  return useContext(actual.SafeAreaFrameContext) ?? DEFAULT_FRAME;
}

module.exports = {
  ...actual,
  initialWindowMetrics: { insets: ZERO_INSETS, frame: DEFAULT_FRAME },
  SafeAreaProvider,
  useSafeAreaInsets,
  useSafeAreaFrame,
};
