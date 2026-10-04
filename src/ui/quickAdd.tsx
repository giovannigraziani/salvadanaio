import { createContext, useContext } from 'react';
import type { ID, Transaction } from '../domain/types';

/**
 * Permette a qualsiasi pagina di aprire la finestra "Nuova spesa" / "Modifica spesa".
 * Senza conto si usa quello della scheda aperta o il conto predefinito.
 */
export const QuickAddContext = createContext<(tx?: Partial<Transaction>, accountId?: ID) => void>(() => {});

export function useOpenTransaction() {
  return useContext(QuickAddContext);
}
