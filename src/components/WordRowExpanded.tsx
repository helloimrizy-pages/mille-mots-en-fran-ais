import type { Word } from '../types';

interface Props {
  word: Word;
  hideTranslation: boolean;
  onPlayWord: () => void;
  onPlaySentence: () => void;
  isSentencePlaying?: boolean;
}

export function WordRowExpanded(_: Props) {
  return null;
}
