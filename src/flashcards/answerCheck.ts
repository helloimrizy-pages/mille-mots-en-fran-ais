export function normalizeForCompare(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9'\-\s]/g, '')
    // Removing punctuation can leave doubled spaces ("more / plus" → "more  plus"),
    // which would otherwise fail to match the same words typed normally.
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every answer a gloss should accept.
 *
 * A gloss can list several meanings ("of, from"), offer alternatives with a
 * slash ("more / plus"), and carry a parenthetical note that is not part of the
 * answer at all ("you (object)"). Answering with any one of the meanings is
 * right, so all of them are accepted.
 *
 * Parentheses are stripped *before* splitting, because a slash inside a note is
 * not an alternative: "know (1st/2nd person singular of savoir)" must yield
 * "know", not "know (1st" and "2nd person singular of savoir)".
 */
export function acceptableAnswers(expected: string): string[] {
  const withoutNotes = expected.replace(/\([^)]*\)/g, ' ');
  const parts = withoutNotes.split(/[,;/]/).map((s) => s.trim()).filter(Boolean);
  // The gloss as written stays acceptable, so typing it verbatim still passes —
  // and so a gloss that is nothing but a note still has something to match.
  return [...new Set([expected.trim(), ...parts].filter(Boolean))];
}

export function isTypedAnswerCorrect(typed: string, expected: string): boolean {
  const a = normalizeForCompare(typed);
  if (!a) return false;
  return acceptableAnswers(expected).some((alt) => normalizeForCompare(alt) === a);
}
