# Image Credits

The animal/object icons in `quiz/images/` are from **Twemoji** (Twitter's open-source emoji set), by Twitter, Inc and other contributors — https://twemoji.twitter.com

Licensed under **CC-BY 4.0**: https://creativecommons.org/licenses/by/4.0/

These are simple, clearly-recognizable, properly-licensed images — not trademarked characters — chosen specifically so they're safe to use and share.

## Photo Puzzle starter pictures (`pictures/`)

All from Wikimedia Commons, public domain / CC0 (no attribution legally required, credited here anyway):

- **farm.jpg** — "Farm barn scenic landscape" by Ryan Hagerty (US Fish & Wildlife Service). Public domain.
- **sports-car.jpg** — "Red sports coupe car" by Leon Brooks, via public-domain-image.com. Public domain.
- **doll.jpg** — "Knitted rag doll", Wikimedia Commons. CC0.
- **superhero.png** — generic flying-superhero silhouette clipart (originally by "ocal" on Clker.com, minor edit by a Wikimedia contributor). Public domain. Deliberately generic/original artwork — not Spider-Man, Superman, or any other trademarked character — so it's safe to use and share without any licensing concern.

## Coloring starter pages (`coloring/`)

- **elephant.jpeg**, **bunny.jpeg** — generic line-art coloring pages, no visible third-party branding.
- **hero.png** — same public-domain superhero clipart as `pictures/superhero.png` above (reused here); not any trademarked character. Flat, solid-colored regions, so the app's flood-fill tool recolors it cleanly.

**Also removed (quality, not licensing):** `princess.png` (CC0 clipart) and `car-icon.png` (Twemoji) were briefly seeded here too. Both were properly licensed but did not work as coloring pages: the car was a 72x72 icon that turns to mush when stretched across the coloring canvas, and the princess was gradient-shaded, so the flood fill (tolerance 10, see `src/coloring/floodFill.ts`) filled only a small speckle of the tapped shade instead of a whole region. Anything added here should be line art or flat color at a real page resolution.

**Note:** earlier versions of this folder briefly included files named `spiderman.png`, `barbie.png`, and `car.png` sourced from third-party "free printable coloring page" websites — those carried both a trademark risk (official-style Spider-Man/Marvel branding and logo) and a copyright risk (visible third-party site watermarks, unclear commercial-redistribution rights). They have been permanently removed and replaced with the properly-licensed, generic content listed above. If you're reviewing this repo's history: do not reintroduce branded/watermarked third-party coloring pages.

## Background music (`music/`)

- **default-track.mp3** — "Happy Adventure (Loop)" by TinyWorlds, via OpenGameArt.org (https://opengameart.org/content/happy-adventure-loop). **CC0** (public domain, no attribution legally required, credited here anyway).

## Sound effects (`sfx/`)

- **correct.mp3** — "Win Jingle" by Fupi, via OpenGameArt.org (https://opengameart.org/content/win-jingle), re-encoded from the source `.ogg` to `.mp3` (same audio, container swap only — Jest's asset transform only recognizes `.mp3`/`.wav`, not `.ogg`). **CC0** (public domain, no attribution legally required, credited here anyway).
- **wrong.mp3** — "Game Over Trumpet SFX" by 0new4y, via OpenGameArt.org (https://opengameart.org/content/game-over-trumpet-sfx). **CC0** (public domain; the author notes "No attribution required," credited here anyway).
