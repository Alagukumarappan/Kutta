import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVITY_LOG_KEY = 'kutta.activityLog.v1';

// The first (and deliberately minimal) piece of local, offline gamification
// infrastructure in this app — a plain completed-activity counter, no
// streaks/timers/notifications. Two counters only (quiz/puzzle) since those
// are the two activities with an unambiguous "finished" signal; Coloring and
// Video have no natural completion moment to hook (open-ended
// fills/re-watchable playback), so they're deliberately not counted here.
export interface ActivityLog {
  quizzesCompleted: number;
  puzzlesCompleted: number;
}

const EMPTY_LOG: ActivityLog = { quizzesCompleted: 0, puzzlesCompleted: 0 };

function normalize(parsed: unknown): ActivityLog {
  const p = (parsed ?? {}) as Record<string, unknown>;
  return {
    quizzesCompleted: typeof p.quizzesCompleted === 'number' ? p.quizzesCompleted : 0,
    puzzlesCompleted: typeof p.puzzlesCompleted === 'number' ? p.puzzlesCompleted : 0,
  };
}

export async function getActivityLog(): Promise<ActivityLog> {
  const raw = await AsyncStorage.getItem(ACTIVITY_LOG_KEY);
  if (!raw) return { ...EMPTY_LOG };
  try {
    return normalize(JSON.parse(raw));
  } catch {
    // A hand-edited or half-written AsyncStorage value shouldn't crash the
    // whole app over a purely decorative counter — just start back at zero,
    // same "best-effort, never block core functionality" spirit as this
    // store's own increment functions below.
    return { ...EMPTY_LOG };
  }
}

async function increment(field: keyof ActivityLog): Promise<ActivityLog> {
  const current = await getActivityLog();
  const next: ActivityLog = { ...current, [field]: current[field] + 1 };
  await AsyncStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(next));
  return next;
}

export async function recordQuizCompleted(): Promise<ActivityLog> {
  return increment('quizzesCompleted');
}

export async function recordPuzzleCompleted(): Promise<ActivityLog> {
  return increment('puzzlesCompleted');
}

// Used by Settings' "Reset everything" flow, alongside clearProfile — a
// reset should feel like a genuine fresh start, not leave an orphaned
// accomplishment count behind for whichever child profile comes next.
export async function clearActivityLog(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVITY_LOG_KEY);
}
