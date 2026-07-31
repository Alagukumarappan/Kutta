import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Reads the OS-level "reduce motion" accessibility setting (a real
// vestibular-safety need, not a style preference — large bouncy/scaling
// transitions can trigger discomfort or nausea for users who enable it) and
// keeps it live if toggled while the app is open. Starts `false` until the
// initial async check resolves, so the very first render still shows the
// normal animation for the (common) case where reduce-motion is off; this
// avoids either blocking first paint on the check or guessing wrong in the
// disabled-by-default direction.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduced(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}
