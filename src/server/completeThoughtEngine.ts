import { CompleteThoughtAnalysis, TranscriptSegment, WordTimestamp } from './types';

// Discourse markers and conjunctions that indicate a dependent opening requiring prior context
const DANGLING_OPENING_PATTERNS = [
  /^(and then|and so|and also|and|but|so|because|which is why|whereas|meanwhile|or else|plus|furthermore|nonetheless)\b/i,
  /^(therefore|consequently|as a result|in that case|for that reason|on the other hand)\b/i
];

// Pronouns with high likelihood of dangling antecedent if appearing right at the start
const DANGLING_PRONOUNS = /^(it|this|that|these|those|they|them|he|him|his|she|her)\b/i;

// Sentence terminal punctuation
const SENTENCE_END_PUNCTUATION = /[.!?]$/;
const INCOMPLETE_END_PATTERNS = /[,;:\-\s]+$/;

export class CompleteThoughtEngine {
  /**
   * Evaluates and refines boundaries for a clip to ensure complete rhetorical and semantic thoughts.
   */
  static analyzeBoundaries(
    startTime: number,
    endTime: number,
    segments: TranscriptSegment[],
    words: WordTimestamp[]
  ): CompleteThoughtAnalysis {
    if (!segments || segments.length === 0) {
      return {
        completeThoughtScore: 80,
        boundaryReason: 'No transcript segments available; standard time boundaries applied.',
        recommendedStart: startTime,
        recommendedEnd: endTime,
        hasDanglingOpening: false,
        hasMidSentenceStart: false,
        hasAbruptEnding: false
      };
    }

    // Find overlapping segments with the candidate time interval
    const overlappingSegments = segments.filter(
      (s) => s.end > startTime && s.start < endTime
    );

    if (overlappingSegments.length === 0) {
      return {
        completeThoughtScore: 75,
        boundaryReason: 'Boundary spans silent or non-verbal segment.',
        recommendedStart: startTime,
        recommendedEnd: endTime,
        hasDanglingOpening: false,
        hasMidSentenceStart: false,
        hasAbruptEnding: false
      };
    }

    const firstSeg = overlappingSegments[0];
    const lastSeg = overlappingSegments[overlappingSegments.length - 1];

    let recommendedStart = startTime;
    let recommendedEnd = endTime;
    let hasMidSentenceStart = false;
    let hasDanglingOpening = false;
    let hasAbruptEnding = false;
    const reasons: string[] = [];

    // 1. Check Start Boundary
    // If the candidate starts mid-segment with a gap
    if (startTime > firstSeg.start + 1.0) {
      // Find the specific word closest to start
      const segWords = firstSeg.words || [];
      const firstWord = segWords.find((w) => w.start >= startTime - 0.5);
      if (firstWord) {
        recommendedStart = firstWord.start;
        // Check if word starts with lowercase or follows a comma
        const wordText = firstWord.word.trim();
        if (wordText && wordText[0] === wordText[0].toLowerCase() && !/^[0-9]/.test(wordText)) {
          hasMidSentenceStart = true;
          // Snap back to segment start to capture full sentence
          recommendedStart = firstSeg.start;
          reasons.push('Snapped start back to sentence onset to prevent cut-off clause.');
        }
      }
    } else {
      // Snap cleanly to segment start
      recommendedStart = firstSeg.start;
    }

    // Check for dangling conjunctions or dependent clauses at start
    const openingText = firstSeg.text.trim();
    for (const pattern of DANGLING_OPENING_PATTERNS) {
      if (pattern.test(openingText)) {
        hasDanglingOpening = true;
        // Look at preceding segment if available to include premise/question
        const firstSegIndex = segments.findIndex((s) => s.id === firstSeg.id);
        if (firstSegIndex > 0) {
          const prevSeg = segments[firstSegIndex - 1];
          // If previous segment ends close, expand to include it
          if (firstSeg.start - prevSeg.end < 2.5) {
            recommendedStart = prevSeg.start;
            reasons.push(
              `Expanded start to include antecedent premise for '${openingText.split(' ')[0]}'.`
            );
            break;
          }
        }
        reasons.push(`Opening contains dependent conjunction: "${openingText.split(' ').slice(0, 3).join(' ')}".`);
        break;
      }
    }

    // Check for dangling pronouns
    if (DANGLING_PRONOUNS.test(openingText)) {
      const firstWord = openingText.split(' ')[0];
      const firstSegIndex = segments.findIndex((s) => s.id === firstSeg.id);
      if (firstSegIndex > 0) {
        const prevSeg = segments[firstSegIndex - 1];
        if (firstSeg.start - prevSeg.end < 2.0) {
          recommendedStart = prevSeg.start;
          reasons.push(`Included preceding context to resolve pronoun reference "${firstWord}".`);
        }
      }
    }

    // 2. Check End Boundary
    const closingText = lastSeg.text.trim();
    const endsWithTerminal = SENTENCE_END_PUNCTUATION.test(closingText);
    const endsWithComma = INCOMPLETE_END_PATTERNS.test(closingText);

    if (endTime < lastSeg.end - 1.0) {
      // Cut off inside the segment
      hasAbruptEnding = true;
      recommendedEnd = lastSeg.end;
      reasons.push('Extended ending to complete current spoken sentence.');
    } else {
      recommendedEnd = lastSeg.end;
      if (!endsWithTerminal || endsWithComma) {
        hasAbruptEnding = true;
        // Check next segment
        const lastSegIndex = segments.findIndex((s) => s.id === lastSeg.id);
        if (lastSegIndex < segments.length - 1) {
          const nextSeg = segments[lastSegIndex + 1];
          if (nextSeg.start - lastSeg.end < 1.2 && nextSeg.end - recommendedStart <= 90) {
            recommendedEnd = nextSeg.end;
            reasons.push('Extended boundary to include sentence conclusion.');
          } else {
            reasons.push('Segment concludes without terminal punctuation.');
          }
        }
      }
    }

    // Calculate Complete Thought Score (0 to 100)
    let score = 100;
    if (hasMidSentenceStart) score -= 25;
    if (hasDanglingOpening) score -= 20;
    if (hasAbruptEnding) score -= 25;

    // Minimum boundary duration constraint: at least 8s
    if (recommendedEnd - recommendedStart < 8.0) {
      score -= 15;
      reasons.push('Duration is relatively short for a self-contained thought.');
    }

    const finalScore = Math.max(20, Math.min(100, score));

    return {
      completeThoughtScore: finalScore,
      boundaryReason: reasons.length > 0 ? reasons.join(' ') : 'Clean, self-contained thought with natural pause boundaries.',
      recommendedStart: Math.max(0, Math.round(recommendedStart * 100) / 100),
      recommendedEnd: Math.round(recommendedEnd * 100) / 100,
      hasDanglingOpening,
      hasMidSentenceStart,
      hasAbruptEnding
    };
  }
}
