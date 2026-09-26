import type { DisplayItem, LaidOutScore } from '@solfa/core';

export type CanvasTheme = {
  readonly background: string;
  readonly foreground: string;
  readonly muted: string;
  readonly bar: string;
  readonly selection: string;
  readonly selectionFill: string;
  readonly selectionStroke: string;
  readonly hover: string;
  readonly error: string;
};

export const LIGHT_THEME: CanvasTheme = {
  background: '#fdfcf9',
  foreground: '#1d1b18',
  muted: '#8a8378',
  bar: '#3a362f',
  selection: '#1d1b18',
  selectionFill: 'rgba(77, 124, 255, 0.16)',
  selectionStroke: '#4d7cff',
  hover: 'rgba(77, 124, 255, 0.07)',
  error: '#c0392b',
};

export const DARK_THEME: CanvasTheme = {
  background: '#16181d',
  foreground: '#e8e6e1',
  muted: '#7d8590',
  bar: '#c8c4bd',
  selection: '#e8e6e1',
  selectionFill: 'rgba(120, 160, 255, 0.22)',
  selectionStroke: '#78a0ff',
  hover: 'rgba(120, 160, 255, 0.1)',
  error: '#ff6b5e',
};

const NOTE_FONT_FAMILY = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const LABEL_FONT = '500 12px ui-sans-serif, system-ui, sans-serif';

function glyphFont(item: Extract<DisplayItem, { kind: 'glyph' }>): string {
  if (item.role === 'section-label' || item.role === 'measure-number') return LABEL_FONT;
  return `600 ${item.fontSize}px ${NOTE_FONT_FAMILY}`;
}

function resolveTheme(theme: CanvasTheme | undefined): CanvasTheme {
  if (theme) return theme;
  if (typeof window === 'undefined') return LIGHT_THEME;
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  return dark ? DARK_THEME : LIGHT_THEME;
}

function paintItem(
  context: CanvasRenderingContext2D,
  item: DisplayItem,
  theme: CanvasTheme,
): void {
  if (item.kind === 'line') {
    context.strokeStyle =
      item.role === 'system-line' ? theme.muted : theme.bar;
    context.lineWidth = item.role === 'system-line' ? 1 : item.width;
    context.beginPath();
    context.moveTo(item.x1, item.y1);
    context.lineTo(item.x2, item.y2);
    context.stroke();
    return;
  }

  context.font = glyphFont(item);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle =
    item.role === 'section-label' || item.role === 'measure-number'
      ? theme.muted
      : item.role === 'accidental' || item.role === 'pulse-mark' || item.role === 'octave-dot'
        ? theme.muted
        : theme.foreground;
  context.fillText(item.code, item.x, item.y);
}

export function drawScore(
  context: CanvasRenderingContext2D,
  laid: LaidOutScore,
  options: {
    readonly theme?: CanvasTheme | undefined;
    readonly selectedNoteIds?: ReadonlySet<string> | undefined;
    readonly hoveredNoteId?: string | null | undefined;
    readonly noteSize?: number | undefined;
  } = {},
): void {
  const theme = resolveTheme(options.theme);
  const selected = options.selectedNoteIds ?? new Set<string>();

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, laid.width, laid.height);
  context.fillStyle = theme.background;
  context.fillRect(0, 0, laid.width, laid.height);
  context.restore();

  const highlighted = new Set<string>(selected);
  if (options.hoveredNoteId && !highlighted.has(options.hoveredNoteId)) {
    highlighted.add(options.hoveredNoteId);
  }

  for (const region of laid.hitRegions) {
    if (!highlighted.has(region.noteId)) continue;
    const isSelected = selected.has(region.noteId);
    context.fillStyle = isSelected ? theme.selectionFill : theme.hover;
    context.fillRect(region.x, region.y, region.width, region.height);
    if (isSelected) {
      context.strokeStyle = theme.selectionStroke;
      context.lineWidth = 1.5;
      context.strokeRect(region.x + 0.75, region.y + 0.75, region.width - 1.5, region.height - 1.5);
    }
  }

  for (const item of laid.items) {
    if (item.kind === 'glyph' && item.noteId !== null && selected.has(item.noteId)) {
      paintItem(context, item, { ...theme, foreground: theme.selection });
      continue;
    }
    paintItem(context, item, theme);
  }
}

export function sizeCanvas(
  canvas: HTMLCanvasElement,
  laid: LaidOutScore,
  pixelRatio: number,
): void {
  const width = Math.max(1, Math.ceil(laid.width));
  const height = Math.max(1, Math.ceil(laid.height));
  if (canvas.width !== Math.ceil(width * pixelRatio)) canvas.width = Math.ceil(width * pixelRatio);
  if (canvas.height !== Math.ceil(height * pixelRatio)) canvas.height = Math.ceil(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext('2d');
  if (context) context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}
