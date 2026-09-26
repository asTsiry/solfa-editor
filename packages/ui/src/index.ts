export { SolfaEditor, createEditor, type SolfaEditorProps } from './SolfaEditor.js';
export { SolfaCanvas, SolfaText, type SolfaCanvasProps, type SolfaTextProps } from './SolfaSurfaces.js';
export {
  drawScore,
  sizeCanvas,
  DARK_THEME,
  LIGHT_THEME,
  type CanvasTheme,
} from './canvas/render.js';
export {
  solfaLanguage,
  solfaHighlighting,
  solfaHighlightStyle,
  isSolfaPitchName,
  SOLFA_LETTERS,
  SOLFA_MODES,
} from './text/solfaLanguage.js';
export { solfaAutocompletion } from './text/solfaCompletion.js';
export { createSolfaDocument, useSolfaDocument } from './state/useSolfaDocument.js';
