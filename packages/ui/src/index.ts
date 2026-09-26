export { SolfaEditor, createEditor, type SolfaEditorProps } from './SolfaEditor.js';
export { SolfaCanvas, SolfaText, type SolfaCanvasProps, type SolfaTextProps } from './SolfaSurfaces.js';
export {
  drawScore,
  sizeCanvas,
  renderScoreCanvas,
  DARK_THEME,
  LIGHT_THEME,
  type CanvasTheme,
  type RenderScoreOptions,
} from './canvas/render.js';
export {
  solfaLanguage,
  solfaHighlighting,
  solfaHighlightStyle,
  isSolfaPitchName,
  SOLFA_LETTERS,
  SOLFA_MODES,
  SOLFA_CLEFS,
  SOLFA_LYRICS_ALIASES,
} from './text/solfaLanguage.js';
export { solfaAutocompletion } from './text/solfaCompletion.js';
export { createSolfaDocument, useSolfaDocument } from './state/useSolfaDocument.js';
export { NoteToolbar, type NoteToolbarProps } from './NoteToolbar.js';
export { LyricEditor, type LyricEditorProps, type LyricEditorTarget } from './LyricEditor.js';
export { Modal, type ModalProps } from './Modal.js';
