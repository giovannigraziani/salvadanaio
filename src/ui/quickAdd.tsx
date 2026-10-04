import { createContext, useContext } from 'react';
import type { Transaction } from '../domain/types';

/** Permette a qualsiasi pagina di aprire la finestra "Nuova spesa" / "Modifica spesa". */
export const QuickAddContext = createContext<(tx?: Partial<Transaction>) => void>(() => {});

export function useOpenTransaction() {
  return useContext(QuickAddContext);
}
