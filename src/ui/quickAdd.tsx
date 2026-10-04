import { createContext, useContext } from 'react';
import type { JointTransaction } from '../domain/types';
import type { Scope } from './TransactionForm';

/**
 * Permette a qualsiasi pagina di aprire la finestra "Nuova spesa" / "Modifica spesa".
 * Senza `scope` la spesa è comune nella sezione del conto cointestato, personale altrove.
 */
export const QuickAddContext = createContext<(tx?: Partial<JointTransaction>, scope?: Scope) => void>(() => {});

export function useOpenTransaction() {
  return useContext(QuickAddContext);
}
