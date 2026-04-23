import { useContext } from 'react';
import { FlashcardContext, type FlashcardApi } from '../contexts/FlashcardContext';

export function useFlashcardState(): FlashcardApi {
  const ctx = useContext(FlashcardContext);
  if (!ctx) throw new Error('useFlashcardState must be used within FlashcardProvider');
  return ctx;
}
