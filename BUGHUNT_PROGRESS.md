# Bug Hunt Loop — Progress Log

Started per `/loop keep on looping and find and fix bugs...think like a child
and also parent and keep on improving until i say stop. you are a senior
architect and senior bug finder. make a clean way. max iterations of 40`.

**Process per iteration:**
1. Pick one focused area of the app (not touched too recently, or newest/least
   battle-tested code first).
2. Hunt for real bugs from two lenses: **the child** (confusing interactions,
   too-small touch targets, unclear feedback, scary error states, anything a
   2-8 year old would get stuck on) and **the parent** (data safety, privacy,
   correctness, crashes, settings behaving as documented, nothing that would
   embarrass a "senior architect" review).
3. Fix only GENUINE issues found — no manufactured busywork just to log an
   iteration. If a pass turns up nothing real, say so honestly.
4. Verify: full test suite + `npx tsc --noEmit`, both clean, before committing.
5. Commit, log the iteration below, push.
6. Stop conditions: user says stop, 40 iterations reached, or 3 consecutive
   iterations find nothing substantive (diminishing returns — logged clearly
   rather than padded).

**Iteration count: 0 / 40 (starting now)**

---
