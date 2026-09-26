# Solfa Editor

A tonic sol-fa notation editor with two synchronised views: a plain-text
notation source and a graphical engraving. Edits in either view update the
other. It runs in the browser today and is packaged as a desktop/mobile app
with Tauri v2.

## Notation

Tonic sol-fa is movable-do: the name of a note depends on the key, and `do` is
always the tonic. A solfa letter therefore names a *scale degree*, not a pitch.

| Symbol | Meaning |
| --- | --- |
| `d` `r` `m` `f` `s` `l` `t` | scale degrees 1-7 |
| `,` before a letter | drop one octave, e.g. `,s` |
| `'` before or after a letter | raise one octave, e.g. `s'` or `'s` |
| `#` / `b` after a letter | accidental, e.g. `f#` |
| `,` after a letter | half pulse, e.g. `d,` |
| `!` | one pulse |
| `-` | one pulse (may be written spaced) |
| `.` | half pulse (may be written spaced) |
| `|` | barline |
| `\|X:` | new section with `do = X`, major |
| `\|X:m` | new section with `do = X`, minor |
| `\|m:` | new section with `do = d`, minor |
| `:do=C` | set the tonic, e.g. `C`, `F#`, `Bb` |
| `:mode=major` | set the mode, `major` or `minor` |
| `//` | comment to end of line |

A note lasts two pulses by default (a crotchet), so a plain `d r m f` is four
beats. Pulse marks are cumulative: `d!` is two pulses, `d!-` is four, `d!.` is
three, `d,` is one, and `d!-.` is five. Marks may be separated by spaces, but a
half-pulse comma must stay attached to its letter so that `d ,r` is unambiguous
(an octave drop, then `r`) rather than `d` plus a one-and-a-half pulse `r`.

A key change starts a new section, which is why the section header form exists:
it is the only way to spell a tonic that is not one of the seven solfa letters.

```
// tonic sol-fa
:do=C
:mode=major
|m: d r m f s l t
|d: |d' r' m' f' s' l' t'
|r:m |r ,m ,f ,s ,l ,t ,d'
```

## Architecture

```
packages/core   pure TypeScript model: pitch, parse, serialize, layout, document
packages/ui     React views: CodeMirror 6 text surface, Canvas 2D engraving
apps/pwa        Vite browser app
apps/desktop    Tauri v2 shell (Windows, macOS, Linux, Android)
```

`@solfa/core` has no DOM dependency and owns all state. `parse` turns text into
a `Score` plus source `Span`s, `serialize` goes the other way, and `layout`
turns a `Score` into a flat display list with hit regions. `SolfaDocument` is the
only mutable object: every change is a command (`text/set`, `note/step`,
`key/set`, `history/undo`, ...), and observers re-render from its state.

Two details make the round trip stable:

- **Stable note ids.** After a text edit, `reconcileIds` finds the longest common
  subsequence of notes between the old and new scores and carries ids across.
  Identical surrounding notes keep their identity, so selection and undo behave
  when you edit the middle of a bar.
- **Key-derived spelling.** A pitch class alone cannot be spelled: 10 is both
  `Bb` and `Ab`. `Key` therefore stores the tonic's letter alongside its pitch,
  and `spellNote` walks the scale letters from that tonic, so the fourth degree
  of F major is `Bb`, not `Ab`.

The two views never write to each other directly. CodeMirror reports text
changes as `text/set`; the canvas reports pointer hits as commands. Each surface
ignores updates that originate from itself, so there is no feedback loop.

## Development

Requires Node 22+ and pnpm 12. A Rust toolchain is needed only for the desktop
and Android builds.

```sh
pnpm install
pnpm dev            # browser app on http://localhost:5173
pnpm build          # static bundle in apps/pwa/dist
pnpm test           # core and ui test suites
pnpm typecheck      # tsc --noEmit across all packages
```

Desktop:

```sh
pnpm tauri:dev      # build the frontend, then launch Tauri
pnpm tauri:build    # native bundles
pnpm tauri:build -- --target android   # requires the Android SDK/NDK
```

Building a native target needs a Rust toolchain plus the platform webview
dependencies (`webkit2gtk-4.1` and `libgtk-3-dev` on Linux).

## Status

- Text and graphical editing are synchronised both ways.
- Keys, modes, accidentals, octave marks, pulse durations, sections, and
  multi-key scores parse, serialise round-trip, and lay out across systems.
- Undo/redo, note id stability, and hit testing are covered by tests.
- Not yet: audio playback, SMuFL/Bravura glyph fonts (engraving currently uses
  system serif fonts), rhythmic noteheads on the staff, and file open/save
  through the Tauri filesystem dialogs.
