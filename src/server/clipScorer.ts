import { ClipScores, VisionFrame, VisionMetrics } from './types';

export interface ScoreInputs {
  transcriptText: string;
  userPrompt: string;
  completeThoughtScore: number;
  duration: number;
  visionFrames: VisionFrame[];
  overallVisionMetrics?: VisionMetrics;
}

export class ClipScorer {
  /**
   * Computes independent analytical signals and a normalized composite ranking score.
   */
  static calculateScores(inputs: ScoreInputs): ClipScores {
    const { transcriptText, userPrompt, completeThoughtScore, duration, visionFrames } = inputs;

    // 1. Topic Relevance (0 - 100)
    let topicRelevance = 70;
    if (userPrompt && userPrompt.trim()) {
      const promptTerms = userPrompt
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length > 2);
      const textLower = transcriptText.toLowerCase();
      let matches = 0;
      for (const term of promptTerms) {
        if (textLower.includes(term)) matches++;
      }
      if (promptTerms.length > 0) {
        topicRelevance = Math.min(100, Math.round(40 + (matches / promptTerms.length) * 60));
      }
    }

    // 2. Hook Strength (first 5 seconds energy, question or bold assertion)
    let hookStrength = 65;
    const firstWords = transcriptText.slice(0, 80).toLowerCase();
    if (firstWords.includes('?') || firstWords.startsWith('why') || firstWords.startsWith('how') || firstWords.startsWith('what')) {
      hookStrength += 20;
    }
    if (/secret|never|mistake|always|crucial|surprising|actually|proven/i.test(firstWords)) {
      hookStrength += 15;
    }
    hookStrength = Math.min(100, Math.max(20, hookStrength));

    // 3. Complete Thought (from Complete Thought Engine)
    const completeThought = Math.min(100, Math.max(0, completeThoughtScore));

    // 4. Information Density (words per second)
    const wordCount = transcriptText.split(/\s+/).filter(Boolean).length;
    const wordsPerSec = duration > 0 ? wordCount / duration : 0;
    // Ideal range: 2.2 - 3.2 words per second
    let informationDensity = 75;
    if (wordsPerSec >= 2.0 && wordsPerSec <= 3.5) {
      informationDensity = 90;
    } else if (wordsPerSec < 1.0) {
      informationDensity = 50;
    } else if (wordsPerSec > 4.2) {
      informationDensity = 65;
    }

    // 5. Audio Quality heuristic
    const audioQuality = 85;

    // 6. Visual signals from tracked frames
    let visualInterest = 70;
    let faceActivity = 70;
    let handMovement = 50;
    let bodyMovement = 60;
    let speakerActivity = 75;

    if (visionFrames.length > 0) {
      const faceCountTotal = visionFrames.reduce((acc, f) => acc + (f.face_count || 0), 0);
      const handCountTotal = visionFrames.reduce((acc, f) => acc + (f.hand_count || 0), 0);
      const avgChange = visionFrames.reduce((acc, f) => acc + (f.visual_change || 0), 0) / visionFrames.length;

      const faceRatio = faceCountTotal / visionFrames.length;
      const handRatio = handCountTotal / visionFrames.length;

      faceActivity = Math.min(100, Math.round(faceRatio * 90 + 10));
      handMovement = Math.min(100, Math.round(handRatio * 95 + 15));
      visualInterest = Math.min(100, Math.round(avgChange * 200 + 40));
      bodyMovement = Math.min(100, Math.round(avgChange * 150 + 50));
      speakerActivity = faceRatio > 0.5 ? 85 : 60;
    }

    // 7. Duplicate Penalty & Compliance Risk
    const duplicatePenalty = 0;
    const complianceRisk = 0;

    // Weighted composite ranking score (0 - 100)
    // Note: Used for internal clip ranking, not virality claims.
    const weightedSum =
      topicRelevance * 0.25 +
      completeThought * 0.25 +
      hookStrength * 0.15 +
      informationDensity * 0.10 +
      visualInterest * 0.10 +
      faceActivity * 0.10 +
      handMovement * 0.05;

    const finalScore = Math.min(100, Math.max(10, Math.round(weightedSum)));

    return {
      topicRelevance,
      hookStrength,
      completeThought,
      informationDensity,
      audioQuality,
      visualInterest,
      faceActivity,
      handMovement,
      bodyMovement,
      speakerActivity,
      duplicatePenalty,
      complianceRisk,
      finalScore
    };
  }
}
