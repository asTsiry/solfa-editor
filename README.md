# Solfa Editor

A tonic sol-fa notation editor for choir, with two synchronised views: a
plain-text notation source and a graphical engraving. Edits in either view
update the other. It runs in the browser today and is packaged as a
desktop/mobile app with Tauri v2.

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
| `~` | hold the previous note of this voice |
| `0` | rest |
| `|` at the start of a line | open a bar |
| `:` between two beats | next beat, same group |
| `\|` between two beats | next beat, new group |
| `\|X:` | new section with `do = X`, major |
| `\|X:m` | new section with `do = X`, minor |
| `\|m:` | new section with `do = d`, minor |
| `\|N:` | new numbered section, same key |
| `:do=C` | set the tonic, e.g. `C`, `F#`, `Bb` |
| `:mode=major` | set the mode, `major` or `minor` |
| `:time=4/4` | set the time signature, also written `:meter=` |
| `:parts=` | declare the voices |
| `//` | comment to end of line |

A note lasts two pulses by default (a crotchet), so a plain `d : r : m : f` is
four beats. A duration starts with `!` and is then extended: each `-` adds two
pulses and each `.` adds one. So `d!` is two pulses, `d!.` is three, `d!-` is
four, and `d!-.` is five. A leading `,` instead means one pulse and cannot be
extended. Marks may be separated by spaces, but a comma must stay attached to
its letter so that `d ,r` is unambiguous (an octave drop, then `r`) rather than
`d` plus a one-pulse `r`. A rest takes a duration too, so `0!.` is a dotted
rest, and rests on the first line of a bar are how a bar keeps its rhythm while
the top voice stays silent.

A key change starts a new section, which is why the section header form exists:
it is the only way to spell a tonic that is not one of the seven solfa letters.

### Bars and groups

A bar opens with a `|` on a line of its own, and **the beats inside it are
separated one by one**: a `:` moves to the next beat of the same group, a `|`
opens a new group. A bare space is not enough, because the short barlines of the
engraving have to be written down:

```
|
S: d : r | m : f
A: r : m | f : s
P: Ave : Ma | ri : a
```

The `:` is engraved as nothing and the `|` as a short barline, while the `|`
that opens the bar becomes a full one. Every voice of a bar has to group its
beats the same way, otherwise the staves would disagree, and the lyrics line
follows the same separators.

The time signature is engraved for information only. The beats are written out
one by one, so `:time=` neither groups nor validates them: `4/4` with three
beats is not an error, and `7/8` with four is not either. It is picked from a
dropdown on the left of the score, under the title, next to the tonic, and it
is undoable like any other edit.

### Voices and lyrics

A bar is written on several lines: **one line per voice**, then a line of
lyrics. Every voice sings the same rhythm, so the durations are written once, on
the first line of the bar; the other lines must hold the same number of notes.

| Line | Meaning |
| --- | --- |
| `S:` `A:` `T:` `B:` | a voice line, by its declared short name |
| `P:` | the lyrics line (`Paroles`, `lyrics`, `words`, `text` also work) |
| `_` | in the lyrics line, a beat with no new syllable |
| bare `d : r : m : f` | shorthand for the first declared voice |

A voice that does not sing a beat writes `0`; it repeats its own previous note
with `~`. Both may also be used inside a bar, and `~` is what the serialiser
writes when two neighbouring notes in a voice are equal.

Lyrics syllables are matched to beats in order and separated like the notes,
and the counts must agree, so `P: Ave : Ma : ri : a : _ : le : nos` sets four
syllables over seven beats. A declared part
whose short name collides with a lyrics alias (`P:`, for instance) wins: the
parser prefers declared parts.

### Title and subtitle

`:title=` and `:subtitle=` set the heading. Unlike the other directives their
value runs to the end of the line, because a title is prose:

```
:title=Ave Maria
:subtitle=pour chœur à quatre voix
```

The title is engraved once, centred above the first system, and the subtitle
sits under it in italics. On the left, under the heading, a key line shows the
tonic with its alteration written out (`Do nat C`, `Fa dia F#`, `Si bem Bb`)
followed by the time signature. A score with neither reserves no space for them. Above
the engraving there is an input on the title itself and a `+ Sous-titre` button
that reveals a second one, so the heading is typed straight onto the page; both
write a directive into the text, which means undo works like everywhere else.

### Parts

Voices are user-definable. `:parts=` takes a comma-separated list of
`Name:ShortName:clef`, where the clef is one of `treble`, `alto`, `tenor`,
`treble8vb`, `bass`. The default is Soprano, Alto, Tenor and Bass, and the
directive is only written when the set is not the default one.

```
// Chœur à quatre voix
:title=Ave Maria
:time=4/4
:parts=Soprano:S:treble,Alto:A:alto,Tenor:T:treble8vb,Bass:B:bass
|
S: d : r | m : f
A: r : m | f : s
T: m : f | s : l
B: f : s | l : t
P: Ave : Ma | ri : a
|1:
S: d' : r' | m' : f'
A: m' : f' | s' : l'
T: f' : s' | l' : t'
B: s' : l' | t' : d''
P: Se : glori | fi : ca
```

The engraving draws one row per voice that actually sings in a section, so a
four-part score stays compact when a part is resting, and the lyrics sit under
the lowest voice of the section. There is no staff: the solfa letters are read
directly, and the only lines drawn are the barline that opens and closes a bar
and the short barlines that open a group.

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
`beat/setPulses`, `lyric/set`, `parts/set`, `time/set`, `history/undo`, ...), and
observers re-render from its state.

Two details make the round trip stable:

- **Stable note ids.** After a text edit, `reconcileIds` finds the longest common
  subsequence of voice notes between the old and new scores and carries ids
  across. Ids are keyed by part as well as by pitch, so two voices singing the
  same degree never collapse into one note.
  Identical surrounding notes keep their identity, so selection and undo behave
  when you edit the middle of a bar.
- **Key-derived spelling.** A pitch class alone cannot be spelled: 10 is both
  `Bb` and `Ab`. `Key` therefore stores the tonic's letter alongside its pitch,
  and `spellNote` walks the scale letters from that tonic, so the fourth degree
  of F major is `Bb`, not `Ab`.

The two views never write to each other directly. CodeMirror reports text
changes as `text/set`; the canvas reports pointer hits as commands. Each surface
ignores updates that originate from itself, so there is no feedback loop.

The panel is a full CodeMirror instance: line numbers, syntax highlighting for
directives, voice labels, notes, lyrics and errors, closing brackets, and
autocompletion from the note table and the two spaces. `createEditorState` is
gone on purpose. `EditorView` resolves its own `extensions` option only when no
`state` is supplied, so passing both would silently drop the update listener and
the language support along with it. The extensions are built into the state in
`createSolfaEditor`, and `textPanel.test.tsx` asserts the gutter and the syntax
tree so this cannot regress unnoticed.

### Editing

Typing in the text panel is immediate: every keystroke is parsed and the
engraving is redrawn. A run of adjacent single-character edits shares one undo
step, so a mistyped word is taken back with a single Ctrl/Cmd + Z, while a paste
or any wider edit stays its own step. The run window slides with the caret, which
is what lets the letters of a word coalesce even though each keystroke lands at a
new offset; the key of the first edit is what the document compares against.

The tonic of the key line is engraved next to the time signature, which is
picked from a dropdown: it is the one control in the margin, and it writes a
`:time=` directive so the change is undoable and survives a reload. The heading
at the top of the engraving is editable in place, and the `+
Sous-titre` button next to it adds or removes the second line.

Clicking a note in the engraving selects it. From there, the selection is edited
either with the keyboard or with the button row under the score, so the same
actions work with a mouse, a touch screen, or a keyboard:

| Action | Keyboard | Button |
| --- | --- | --- |
| raise or lower by a degree | `↑` / `↓` | `▲` / `▼` |
| raise or lower by an octave | `Shift` + `↑` / `↓` | `▲8` / `▼8` |
| accidental | — | `♯` `♭` `♮`, or `♯ ♭ ♮` to cycle |
| silence a voice on that beat | — | `𝄽` |

`𝄽` writes a `0` in the text for that voice and beat, leaving the shared rhythm
and the other voices untouched, so a rest never changes the bar. A rest cannot be
clicked, so bringing a voice back in is done in the text panel; the voice then
picks up the pitch it sang just before, so a stray rest never scrambles the
contour.

A syllable is edited in place: click it under the notes, type, then press `Enter`
or click away to confirm, or `Escape` to cancel. The toolbar's **Parole** button
does the same for the selected note.

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
- User-definable voices with a shared rhythm, per-voice holds and rests, and a
  lyrics line, parse, round-trip, and engrave one row per singing part.
- Undo/redo, note id stability, and hit testing are covered by tests.
- **Enregistrer** opens a dialog that exports the engraving as a PDF (A4, fitted)
  or a PNG, with a file name field. Exports omit the selection and hover
  highlights.
- **Aide** opens a French reference for the notation, the toolbar and the
  shortcuts.
- The text is auto-persisted to `localStorage`, and **Charger** restores it.

Not yet: audio playback, SMuFL/Bravura glyph fonts (engraving currently uses
system serif fonts), rhythmic noteheads on the staff, clefs drawn on the staff,
editing the rhythm from the score rather than the text, bringing a rest back
from the canvas, file open/save through the Tauri filesystem dialogs, and canvas
note editing by drag. The time signature is engraved but does not yet check the
number of beats written in a bar.
