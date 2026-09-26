import type { DocumentState } from '@solfa/core';
import { renderScoreCanvas, type CanvasTheme, type RenderScoreOptions } from '@solfa/ui';

export type ExportFormat = 'png' | 'pdf';

const A4 = { width: 595.28, height: 841.89 } as const;
const PAGE_MARGIN = 28;

export type ExportOptions = {
  readonly state: DocumentState;
  readonly fileName: string;
  readonly format: ExportFormat;
  readonly theme?: CanvasTheme | undefined;
  readonly scale?: number | undefined;
};

export type PageBox = { readonly width: number; readonly height: number };
export type Placement = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export function sanitizeFileName(raw: string, fallback = 'partition-solfa'): string {
  const cleaned = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120)
    .trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

/** Chooses a page box that matches the orientation of the score. */
export function choosePage(imageWidth: number, imageHeight: number): PageBox {
  const landscape = imageWidth > imageHeight;
  return {
    width: landscape ? A4.height : A4.width,
    height: landscape ? A4.width : A4.height,
  };
}

/** Scales the score to fit the printable area, preserving its aspect ratio. */
export function fitToPage(
  imageWidth: number,
  imageHeight: number,
  page: PageBox,
  margin = PAGE_MARGIN,
): Placement {
  const availableWidth = Math.max(1, page.width - margin * 2);
  const availableHeight = Math.max(1, page.height - margin * 2);
  const ratio = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  const width = imageWidth * ratio;
  const height = imageHeight * ratio;
  return {
    x: (page.width - width) / 2,
    y: (page.height - height) / 2,
    width,
    height,
  };
}

function scoreOptions(state: DocumentState, options: ExportOptions): RenderScoreOptions {
  return {
    score: state.score,
    spans: state.spans,
    theme: options.theme,
    scale: options.scale ?? 2,
  };
}

function renderForExport(options: ExportOptions): HTMLCanvasElement {
  try {
    return renderScoreCanvas(scoreOptions(options.state, options));
  } catch {
    throw new Error("Impossible de préparer l'image de la partition.");
  }
}

function triggerDownload(url: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("L'export de l'image a échoué."));
        return;
      }
      resolve(blob);
    }, type);
  });
}

export async function exportScorePng(options: ExportOptions): Promise<string> {
  const canvas = renderForExport(options);
  const blob = await canvasToBlob(canvas, 'image/png');
  const url = URL.createObjectURL(blob);
  const fileName = `${sanitizeFileName(options.fileName)}.png`;
  triggerDownload(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return fileName;
}

let jsPdfModule: Promise<typeof import('jspdf')> | null = null;

function loadJsPdf(): Promise<typeof import('jspdf')> {
  if (jsPdfModule === null) {
    jsPdfModule = import('jspdf').catch((cause: unknown) => {
      jsPdfModule = null;
      throw cause;
    });
  }
  return jsPdfModule;
}

export function warmUpPdfExport(): void {
  void loadJsPdf().catch(() => undefined);
}

export async function exportScorePdf(options: ExportOptions): Promise<string> {
  let jsPDF: typeof import('jspdf').jsPDF;
  try {
    ({ jsPDF } = await loadJsPdf());
  } catch {
    throw new Error(
      "Le module PDF n'a pas pu être chargé. Rechargez la page puis réessayez.",
    );
  }

  const canvas = renderForExport(options);
  const dataUrl = canvas.toDataURL('image/png');

  const page = choosePage(canvas.width, canvas.height);
  const placement = fitToPage(canvas.width, canvas.height, page);

  const pdf = new jsPDF({
    orientation: page.width > page.height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [page.width, page.height],
  });
  pdf.addImage(dataUrl, 'PNG', placement.x, placement.y, placement.width, placement.height);

  const fileName = `${sanitizeFileName(options.fileName)}.pdf`;
  pdf.save(fileName);
  return fileName;
}

export async function exportScore(options: ExportOptions): Promise<string> {
  return options.format === 'pdf' ? exportScorePdf(options) : exportScorePng(options);
}
