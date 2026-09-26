import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Modal } from '@solfa/ui';
import { exportScore, sanitizeFileName, warmUpPdfExport, type ExportFormat } from './exportScore.js';
import type { SolfaDocument } from '@solfa/core';

export type SaveDialogProps = {
  readonly open: boolean;
  readonly document: SolfaDocument;
  readonly onClose: () => void;
};

const FORMATS: readonly { value: ExportFormat; title: string; note: string }[] = [
  {
    value: 'pdf',
    title: 'PDF',
    note: 'Une page A4, image vectorielle de la partition, prête à imprimer.',
  },
  {
    value: 'png',
    title: 'Image PNG',
    note: 'Image haute résolution de la partition, transparence désactivée.',
  },
];

export function SaveDialog(props: SaveDialogProps): JSX.Element {
  const [fileName, setFileName] = useState('partition-solfa');
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setDone(null);
    setBusy(false);
    warmUpPdfExport();
  }, [props.open]);

  const handleSave = useCallback(async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const written = await exportScore({
        state: props.document.getState(),
        fileName,
        format,
      });
      setDone(`Enregistré : ${written}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L'enregistrement a échoué.");
    } finally {
      setBusy(false);
    }
  }, [props.document, fileName, format]);

  const preview = sanitizeFileName(fileName);

  return (
    <Modal
      title="Enregistrer la partition"
      open={props.open}
      onClose={props.onClose}
      closeLabel="Fermer"
      footer={
        <>
          {error === null && done === null ? null : (
            <span className="solfa-save-note" data-error={error !== null}>
              {error ?? done}
            </span>
          )}
          <button type="button" className="solfa-button" onClick={props.onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="solfa-button solfa-button-primary"
            onClick={() => void handleSave()}
            disabled={busy}
          >
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <div className="solfa-field">
        <label htmlFor="solfa-file-name">Nom du fichier</label>
        <input
          id="solfa-file-name"
          type="text"
          value={fileName}
          onChange={(event) => setFileName(event.target.value)}
          placeholder="partition-solfa"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="solfa-field-hint">
          Le fichier s&apos;appellera <code>{preview}.{format}</code>
        </span>
      </div>

      <div className="solfa-field">
        <label>Format</label>
        <div className="solfa-format">
          {FORMATS.map((option) => (
            <label key={option.value} className="solfa-format-option">
              <input
                type="radio"
                name="solfa-format"
                value={option.value}
                checked={format === option.value}
                onChange={() => setFormat(option.value)}
              />
              <span className="solfa-format-option-text">
                <span className="solfa-format-option-title">{option.title}</span>
                <span className="solfa-format-option-note">{option.note}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
