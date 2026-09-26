import { CandidateClip } from './types';

export class DuplicateDetector {
  /**
   * Calculates Intersection over Union (IoU) between two time intervals.
   */
  static timeIntervalIoU(startA: number, endA: number, startB: number, endB: number): number {
    const interStart = Math.max(startA, startB);
    const interEnd = Math.min(endA, endB);
    const intersection = Math.max(0, interEnd - interStart);
    if (intersection === 0) return 0;
    const union = (endA - startA) + (endB - startB) - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Computes Jaccard word token similarity between two transcript texts.
   */
  static textSimilarity(textA: string, textB: string): number {
    const tokensA = new Set(textA.toLowerCase().split(/\W+/).filter((t) => t.length > 2));
    const tokensB = new Set(textB.toLowerCase().split(/\W+/).filter((t) => t.length > 2));
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let common = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) common++;
    }
    const union = tokensA.size + tokensB.size - common;
    return union > 0 ? common / union : 0;
  }

  /**
   * Filters out overlapping or redundant duplicate moments, keeping the highest-scoring version.
   */
  static filterDuplicates(candidates: CandidateClip[], maxIoU = 0.45, maxTextSim = 0.65): CandidateClip[] {
    const kept: CandidateClip[] = [];

    // Sort descending by preliminary score
    const sorted = [...candidates].sort((a, b) => b.scores.finalScore - a.scores.finalScore);

    for (const cand of sorted) {
      let isDuplicate = false;

      for (const accepted of kept) {
        const iou = this.timeIntervalIoU(cand.startTime, cand.endTime, accepted.startTime, accepted.endTime);
        const textSim = this.textSimilarity(cand.transcript, accepted.transcript);

        if (iou > maxIoU || (iou > 0.25 && textSim > maxTextSim)) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        kept.push(cand);
      }
    }

    return kept;
  }
}
