import { DEFAULT_TIME_SIGNATURE, normalizeTimeSignature } from './meter.js';
import { reconcileScore } from './reconcile.js';
import { parse } from './parse.js';
import { serialize } from './serialize.js';
import {
  findBeat,
  findVoiceNote,
  iterateVoiceNotes,
  partOf,
  nearestNoteOfPart,
  voiceNotesOf,
  withBeat,
  withBeatNote,
  withSectionKey,
  withVoiceNote,
  DEFAULT_PARTS,
  type Beat,
  type Key,
  type ParseError,
  type PartId,
  type Score,
  type Span,
  type VoiceNote,
} from './score.js';
import type { Accidental } from './pitch.js';
import { DEFAULT_KEY, MAX_PULSES, MIN_PULSES, mod12 } from './pitch.js';

export type Selection = {
  readonly noteIds: readonly string[];
};

export type DocumentState = {
  readonly text: string;
  readonly score: Score;
  readonly spans: readonly Span[];
  readonly errors: readonly ParseError[];
  readonly valid: boolean;
  readonly selection: Selection;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly revision: number;
};

export type Command =
  | { readonly type: 'text/set'; readonly text: string; readonly coalesceKey?: string }
  | { readonly type: 'note/setDegree'; readonly noteId: string; readonly degree: number }
  | {
      readonly type: 'note/setAccidental';
      readonly noteId: string;
      readonly accidental: Accidental;
    }
  | { readonly type: 'beat/setPulses'; readonly beatId: string; readonly pulses: number }
  | { readonly type: 'lyric/set'; readonly beatId: string; readonly lyric: string | null }
  | {
      readonly type: 'voice/setRest';
      readonly beatId: string;
      readonly partId: PartId;
      readonly rest: boolean;
    }
  | { readonly type: 'note/select'; readonly noteIds: readonly string[] }
  | { readonly type: 'note/step'; readonly noteId: string; readonly delta: number }
  | { readonly type: 'title/set'; readonly field: 'title' | 'subtitle'; readonly value: string | null }
  | { readonly type: 'key/set'; readonly key: Key }
  | { readonly type: 'time/set'; readonly value: string }
  | { readonly type: 'parts/set'; readonly parts: Score['parts'] }
  | { readonly type: 'history/undo' }
  | { readonly type: 'history/redo' };

type HistoryEntry = { text: string; coalesceKey: string | null };

const HISTORY_LIMIT = 200;

const EMPTY_SCORE: Score = {
  kind: 'score',
  title: null,
  subtitle: null,
  timeSignature: DEFAULT_TIME_SIGNATURE,
  parts: DEFAULT_PARTS,
  sections: [],
};

const BOOTSTRAP_STATE: DocumentState = {
  text: '',
  score: EMPTY_SCORE,
  spans: [],
  errors: [],
  valid: true,
  selection: { noteIds: [] },
  canUndo: false,
  canRedo: false,
  revision: 0,
};

export class SolfaDocument {
  private state: DocumentState = BOOTSTRAP_STATE;
  private idCounter = 0;
  private nextId = (): string => {
    this.idCounter += 1;
    return `e${this.idCounter.toString(36)}`;
  };
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<() => void>();

  constructor(initialText = '') {
    this.state = this.commitText(initialText, false);
  }

  getState(): DocumentState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispatch(command: Command): DocumentState {
    const next = this.reduce(this.state, command);
    if (next !== this.state) {
      this.state = next;
      for (const listener of this.listeners) listener();
    }
    return this.state;
  }

  private pushHistory(text: string, coalesceKey: string | null): void {
    const top = this.undoStack[this.undoStack.length - 1];
    if (coalesceKey && top && top.coalesceKey === coalesceKey) return;
    this.undoStack.push({ text, coalesceKey });
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  private commitText(text: string, recordHistory: boolean): DocumentState {
    if (recordHistory) this.pushHistory(this.state.text, null);

    const result = parse(text);
    const score = reconcileScore(this.state.score, result.score);

    const valid = result.errors.length === 0;
    const alive = new Set(voiceNotesOf(score).map((note) => note.id));
    const selection = {
      noteIds: this.state.selection.noteIds.filter((id) => alive.has(id)),
    };

    return {
      text,
      score,
      spans: result.spans,
      errors: result.errors,
      valid,
      selection,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      revision: this.state.revision + 1,
    };
  }

  private commitScore(score: Score, selectNoteId?: string | null): DocumentState {
    const { text, spans } = serialize(score);
    this.pushHistory(this.state.text, null);
    return {
      text,
      score,
      spans,
      errors: [],
      valid: true,
      selection: {
        noteIds:
          selectNoteId === null
            ? []
            : selectNoteId
              ? [selectNoteId]
              : this.state.selection.noteIds,
      },
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      revision: this.state.revision + 1,
    };
  }

  private reduce(state: DocumentState, command: Command): DocumentState {
    switch (command.type) {
      case 'text/set': {
        if (command.text === state.text) return state;
        if (command.coalesceKey) {
          this.pushHistory(state.text, command.coalesceKey);
          return this.commitText(command.text, false);
        }
        return this.commitText(command.text, true);
      }

      case 'note/setDegree': {
        const score = withVoiceNote(state.score, command.noteId, { degree: command.degree });
        if (score === state.score) return state;
        return this.commitScore(score, command.noteId);
      }

      case 'note/step': {
        const current = this.findNote(command.noteId);
        if (!current) return state;
        const next = Math.max(-7, Math.min(21, current.degree + command.delta));
        if (next === current.degree) return state;
        const score = withVoiceNote(state.score, command.noteId, { degree: next });
        return this.commitScore(score, command.noteId);
      }

      case 'note/setAccidental': {
        const score = withVoiceNote(state.score, command.noteId, {
          accidental: command.accidental,
        });
        if (score === state.score) return state;
        return this.commitScore(score, command.noteId);
      }

      case 'beat/setPulses': {
        const pulses = Math.max(MIN_PULSES, Math.min(MAX_PULSES, command.pulses));
        const beat = findBeat(state.score, command.beatId);
        if (!beat || beat.pulses === pulses) return state;
        const score = withBeat(state.score, command.beatId, { pulses });
        if (score === state.score) return state;
        return this.commitScore(score);
      }

      case 'lyric/set': {
        const beat = findBeat(state.score, command.beatId);
        if (!beat) return state;
        const lyric = command.lyric === null || command.lyric === '' ? null : command.lyric;
        if (beat.lyric === lyric) return state;
        const score = withBeat(state.score, command.beatId, { lyric });
        if (score === state.score) return state;
        return this.commitScore(score);
      }

      case 'title/set': {
        const value = command.value === null || command.value.trim() === '' ? null : command.value.trim();
        if (state.score[command.field] === value) return state;
        const score: Score = { ...state.score, [command.field]: value };
        return this.commitScore(score);
      }

      case 'time/set': {
        const value = normalizeTimeSignature(command.value);
        if (state.score.timeSignature === value) return state;
        return this.commitScore({ ...state.score, timeSignature: value });
      }

      case 'key/set': {
        const section = state.score.sections[0];
        if (!section) return state;
        const score = withSectionKey(state.score, section.id, command.key);
        if (score === state.score) return state;
        return this.commitScore(score);
      }

      case 'parts/set': {
        if (command.parts.length === 0) return state;
        const score = reconcileScore(state.score, { ...state.score, parts: command.parts });
        if (serializePartsEqual(score, state.score)) return state;
        return this.commitScore(score);
      }

      case 'voice/setRest': {
        const beat = findBeat(state.score, command.beatId);
        if (!beat) return state;
        const partIndex = state.score.parts.findIndex((part) => part.id === command.partId);
        if (partIndex < 0) return state;
        const current = beat.notes[partIndex] ?? null;

        if (command.rest) {
          if (current === null) return state;
          const silenced = this.state.selection.noteIds.includes(current.id);
          return this.commitScore(
            withBeatNote(state.score, beat.id, command.partId, null),
            silenced ? null : undefined,
          );
        }
        if (current !== null) return state;

        const previous = nearestNoteOfPart(state.score, beat.id, command.partId);
        const restored: VoiceNote = {
          kind: 'voiceNote',
          id: this.nextId(),
          partId: command.partId,
          degree: previous?.degree ?? 0,
          accidental: previous?.accidental ?? 0,
        };
        return this.commitScore(withBeatNote(state.score, beat.id, command.partId, restored), restored.id);
      }

      case 'note/select': {
        return {
          ...state,
          selection: { noteIds: [...command.noteIds] },
        };
      }

      case 'history/undo': {
        const entry = this.undoStack.pop();
        if (!entry) return state;
        this.redoStack.push({ text: state.text, coalesceKey: null });
        const restored = this.commitText(entry.text, false);
        return {
          ...restored,
          canUndo: this.undoStack.length > 0,
          canRedo: this.redoStack.length > 0,
        };
      }

      case 'history/redo': {
        const entry = this.redoStack.pop();
        if (!entry) return state;
        this.undoStack.push({ text: state.text, coalesceKey: null });
        const restored = this.commitText(entry.text, false);
        return {
          ...restored,
          canUndo: this.undoStack.length > 0,
          canRedo: this.redoStack.length > 0,
        };
      }

      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
  }

  findNote(noteId: string): VoiceNote | undefined {
    return findVoiceNote(this.state.score, noteId);
  }

  findBeat(beatId: string): Beat | undefined {
    return findBeat(this.state.score, beatId);
  }

  beatOfNote(noteId: string): Beat | undefined {
    for (const section of this.state.score.sections) {
      for (const measure of section.measures) {
        for (const beat of measure.beats) {
          if (beat.notes.some((note) => note && note.id === noteId)) return beat;
        }
      }
    }
    return undefined;
  }

  partOfNote(noteId: string) {
    const note = this.findNote(noteId);
    return note ? partOf(this.state.score, note.partId) : undefined;
  }

  noteIds(): string[] {
    return [...iterateVoiceNotes(this.state.score)].map((note) => note.id);
  }
}

function serializePartsEqual(a: Score, b: Score): boolean {
  return JSON.stringify(a.parts) === JSON.stringify(b.parts);
}

export function transposeKey(key: Key, semitones: number): Key {
  return { ...key, doPitch: key.doPitch + semitones };
}

export function keyForTonic(pitch: { pitchClass: number; letter: string }, mode: Key['mode']): Key {
  const currentOctave = Math.floor(DEFAULT_KEY.doPitch / 12);
  return {
    doPitch: currentOctave * 12 + mod12(pitch.pitchClass),
    doLetter: pitch.letter,
    mode,
  };
}

export { EMPTY_SCORE };
