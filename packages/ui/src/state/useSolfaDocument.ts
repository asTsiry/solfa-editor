import { SolfaDocument, type DocumentState } from '@solfa/core';
import { useEffect, useMemo, useState } from 'react';

export function createSolfaDocument(initialText = ''): SolfaDocument {
  return new SolfaDocument(initialText);
}

export function useSolfaDocument(
  initialText = '',
  external?: SolfaDocument,
): { readonly document: SolfaDocument; readonly state: DocumentState } {
  const owned = useMemo(() => createSolfaDocument(initialText), [initialText]);
  const document = external ?? owned;
  const [state, setState] = useState<DocumentState>(() => document.getState());

  useEffect(() => {
    setState(document.getState());
    return document.subscribe(() => setState(document.getState()));
  }, [document]);

  return { document, state };
}
