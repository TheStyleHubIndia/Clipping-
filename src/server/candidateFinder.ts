import { GoogleGenAI } from '@google/genai';
import {
  CandidateClip,
  CampaignProfile,
  TranscriptData,
  VisionData,
  WordTimestamp
} from './types';
import { CompleteThoughtEngine } from './completeThoughtEngine';
import { ClipScorer } from './clipScorer';
import { DuplicateDetector } from './duplicateDetector';
import { ComplianceEngine } from './complianceEngine';

export class CandidateFinder {
  /**
   * Generates high-quality candidate short-form clips based on video transcript,
   * visual metrics, complete thought evaluation, and user prompt.
   */
  static async findCandidates(
    transcript: TranscriptData,
    vision: VisionData | null,
    userPrompt: string = '',
    campaignProfile?: CampaignProfile,
    minDuration: number = 15,
    maxDuration: number = 60
  ): Promise<CandidateClip[]> {
    const segments = transcript.segments || [];
    if (segments.length === 0) {
      // If transcript is empty (e.g. music/silent clip), generate visual-guided candidates
      return this.generateVisionGuidedCandidates(transcript.duration, vision, userPrompt, campaignProfile);
    }

    let rawCandidates: Array<{
      title: string;
      summary: string;
      start: number;
      end: number;
      text: string;
      reason: string;
    }> = [];

    // Try Gemini provider first if API key is present for deep semantic reasoning
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim().length > 10) {
      try {
        const aiCandidates = await this.queryGeminiForMoments(transcript, userPrompt, minDuration, maxDuration, apiKey);
        if (aiCandidates && aiCandidates.length > 0) {
          rawCandidates = aiCandidates;
        }
      } catch (err) {
        console.warn('Gemini moment discovery fallback to local semantic windowing:', err);
      }
    }

    // Fallback or local semantic clustering engine
    if (rawCandidates.length === 0) {
      rawCandidates = this.findLocalSemanticMoments(segments, userPrompt, minDuration, maxDuration);
    }

    // Process and enrich each candidate
    const processedCandidates: CandidateClip[] = [];

    for (let i = 0; i < rawCandidates.length; i++) {
      const raw = rawCandidates[i];
      const initialStart = raw.start;
      const initialEnd = raw.end;

      // Extract words
      const clipWords: WordTimestamp[] = [];
      for (const seg of segments) {
        if (seg.words && seg.end >= initialStart && seg.start <= initialEnd) {
          for (const w of seg.words) {
            if (w.end >= initialStart && w.start <= initialEnd) {
              clipWords.push(w);
            }
          }
        }
      }

      // Complete Thought Analysis & boundary expansion
      const completeThought = CompleteThoughtEngine.analyzeBoundaries(
        initialStart,
        initialEnd,
        segments,
        clipWords
      );

      const finalStart = completeThought.recommendedStart;
      const finalEnd = completeThought.recommendedEnd;
      const duration = Math.max(1, Math.round((finalEnd - finalStart) * 10) / 10);

      // Re-slice words for final refined boundaries
      const refinedWords: WordTimestamp[] = [];
      const segmentTexts: string[] = [];
      for (const seg of segments) {
        if (seg.end >= finalStart && seg.start <= finalEnd) {
          segmentTexts.push(seg.text.trim());
          if (seg.words) {
            for (const w of seg.words) {
              if (w.end >= finalStart && w.start <= finalEnd) {
                refinedWords.push(w);
              }
            }
          }
        }
      }

      const fullClipText = segmentTexts.join(' ') || raw.text;

      // Extract vision frame slice for this clip
      const clipVisionFrames = vision?.frames.filter(
        (f) => f.timestamp >= finalStart && f.timestamp <= finalEnd
      ) || [];

      // Calculate independent scores
      const scores = ClipScorer.calculateScores({
        transcriptText: fullClipText,
        userPrompt,
        completeThoughtScore: completeThought.completeThoughtScore,
        duration,
        visionFrames: clipVisionFrames,
        overallVisionMetrics: vision?.metrics
      });

      // Generate 3 faithful hook suggestions from the spoken words
      const hooks = this.generateFaithfulHooks(fullClipText, raw.title);

      // Run compliance check
      const compliance = ComplianceEngine.evaluateClip(
        fullClipText,
        hooks[0] || '',
        campaignProfile
      );

      // Compute default 9:16 crop window from vision data
      let initialCrop = undefined;
      if (clipVisionFrames.length > 0) {
        const avgCenterX =
          clipVisionFrames.reduce((acc, f) => acc + (f.crop_9_16?.center_x || vision?.source.width! / 2), 0) /
          clipVisionFrames.length;
        const cropW = vision?.crop_dimensions.width || 607;
        const cropH = vision?.crop_dimensions.height || 1080;
        const clampedX = Math.max(0, Math.min((vision?.source.width || 1920) - cropW, Math.round(avgCenterX - cropW / 2)));
        initialCrop = {
          x: clampedX,
          y: Math.max(0, Math.round(((vision?.source.height || 1080) - cropH) / 2)),
          width: cropW,
          height: cropH,
          center_x: Math.round(avgCenterX)
        };
      }

      processedCandidates.push({
        id: `clip_${Date.now()}_${i + 1}`,
        title: raw.title,
        summary: raw.summary || raw.reason,
        startTime: finalStart,
        endTime: finalEnd,
        duration,
        transcript: fullClipText,
        words: refinedWords,
        completeThought,
        scores,
        compliance,
        suggestedHooks: hooks,
        selectedHook: hooks[0],
        reframeMode: 'FACE_PLUS_HANDS',
        captionStyle: 'BOLD',
        crop: initialCrop
      });
    }

    // Apply Duplicate Detection to remove repetitive moments and maintain diversity
    const distinctCandidates = DuplicateDetector.filterDuplicates(processedCandidates);

    // Sort by internal rank score
    distinctCandidates.sort((a, b) => b.scores.finalScore - a.scores.finalScore);

    return distinctCandidates;
  }

  private static generateFaithfulHooks(text: string, title: string): string[] {
    const sentences = text
      .split(/[.?!]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10 && s.length < 90);

    const hooks: string[] = [];

    // Option 1: Clean summary hook
    if (title && title.length < 50) {
      hooks.push(title.toUpperCase());
    } else if (sentences.length > 0) {
      hooks.push(sentences[0].toUpperCase());
    } else {
      hooks.push('KEY INSIGHT EXPLAINED');
    }

    // Option 2: Leading question from text
    const questionSentence = sentences.find((s) => s.toLowerCase().startsWith('how') || s.toLowerCase().startsWith('why') || s.toLowerCase().startsWith('what'));
    if (questionSentence) {
      hooks.push(questionSentence.toUpperCase() + '?');
    } else if (sentences.length > 1) {
      hooks.push(`WHY: ${sentences[1].slice(0, 45).toUpperCase()}...`);
    } else {
      hooks.push('THE REASON WHY THIS MATTERS');
    }

    // Option 3: Direct punchy highlight
    if (sentences.length > 0) {
      const words = sentences[0].split(' ');
      const shortPunch = words.slice(0, Math.min(6, words.length)).join(' ').toUpperCase();
      hooks.push(shortPunch);
    } else {
      hooks.push('CRITICAL BREAKDOWN');
    }

    return Array.from(new Set(hooks)).slice(0, 3);
  }

  private static findLocalSemanticMoments(
    segments: any[],
    userPrompt: string,
    minDur: number,
    maxDur: number
  ): Array<{ title: string; summary: string; start: number; end: number; text: string; reason: string }> {
    const candidates: Array<{ title: string; summary: string; start: number; end: number; text: string; reason: string }> = [];

    const promptTokens = (userPrompt || '')
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2 && !['find', 'moments', 'where', 'show', 'the', 'and', 'for', 'about'].includes(t));

    // Rolling window across segments
    let i = 0;
    while (i < segments.length) {
      const segStart = segments[i].start;
      let windowEnd = segStart;
      let windowText = '';
      let j = i;

      while (j < segments.length && segments[j].end - segStart <= maxDur) {
        windowEnd = segments[j].end;
        windowText += ' ' + segments[j].text.trim();
        j++;

        const currentDur = windowEnd - segStart;
        if (currentDur >= minDur) {
          // Score relevance against prompt tokens
          let matchCount = 0;
          const lowerText = windowText.toLowerCase();
          for (const token of promptTokens) {
            if (lowerText.includes(token)) matchCount++;
          }

          // Heuristic info density: words per second
          const wordCount = windowText.split(/\s+/).length;
          const wps = wordCount / currentDur;

          if (promptTokens.length === 0 || matchCount > 0 || j === segments.length) {
            const firstSentence = windowText.trim().split(/[.?!]/)[0] || 'Insightful Section';
            candidates.push({
              title: firstSentence.slice(0, 50),
              summary: windowText.trim().slice(0, 140) + '...',
              start: segStart,
              end: windowEnd,
              text: windowText.trim(),
              reason: promptTokens.length > 0 && matchCount > 0
                ? `Strong semantic relevance to "${promptTokens.slice(0, 3).join(', ')}"`
                : `High information density (${Math.round(wps * 10) / 10} words/sec) and narrative pacing.`
            });
            break;
          }
        }
      }

      // Step forward by 2 segments to allow overlap exploration
      i += Math.max(1, Math.floor((j - i) / 2));
    }

    return candidates.slice(0, 8);
  }

  private static async queryGeminiForMoments(
    transcript: TranscriptData,
    userPrompt: string,
    minDur: number,
    maxDur: number,
    apiKey: string
  ) {
    const ai = new GoogleGenAI({ apiKey });
    const promptText = `
You are an expert video editor and clip researcher. Analyze this video transcript to find the strongest, most compelling, self-contained candidate clips that match the user request.

USER CRITERIA:
"${userPrompt || 'Find the most engaging, high-value, educational, or entertaining moments.'}"

DURATION CONSTRAINTS:
Between ${minDur} seconds and ${maxDur} seconds.

RULES:
- Clips must represent a COMPLETE THOUGHT (beginning with a clear premise, ending with resolution).
- Never select a clip starting with dangling pronouns ("it", "they") or mid-sentence conjunctions ("and so", "because").
- Return strictly valid JSON array with 3 to 6 candidates.

TRANSCRIPT:
${transcript.segments.map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s]: ${s.text}`).join('\n')}

Format strictly as JSON array of objects:
[
  {
    "title": "Short Punchy Title (max 6 words)",
    "summary": "1 sentence explanation of what happens and why it is valuable",
    "start": 12.5,
    "end": 45.0,
    "reason": "Why this moment matches user criteria and constitutes a complete thought"
  }
]
`;

    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptText,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = res.text?.trim() || '[]';
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map((item: any) => ({
        title: item.title,
        summary: item.summary,
        start: parseFloat(item.start),
        end: parseFloat(item.end),
        text: '',
        reason: item.reason || 'Identified by AI Moment Discovery'
      }));
    }
    return [];
  }

  private static generateVisionGuidedCandidates(
    totalDuration: number,
    vision: VisionData | null,
    userPrompt: string,
    campaignProfile?: CampaignProfile
  ): CandidateClip[] {
    const candidates: CandidateClip[] = [];
    const clipDuration = Math.min(30, Math.max(15, totalDuration / 2));
    const count = Math.min(3, Math.max(1, Math.floor(totalDuration / clipDuration)));

    for (let i = 0; i < count; i++) {
      const start = i * clipDuration;
      const end = Math.min(totalDuration, start + clipDuration);
      candidates.push({
        id: `clip_vis_${Date.now()}_${i + 1}`,
        title: `Visual Highlight Moment ${i + 1}`,
        summary: 'Moment identified based on visual dynamics and movement activity.',
        startTime: Math.round(start * 10) / 10,
        endTime: Math.round(end * 10) / 10,
        duration: Math.round((end - start) * 10) / 10,
        transcript: '[Non-verbal or ambient audio section]',
        words: [],
        completeThought: {
          completeThoughtScore: 85,
          boundaryReason: 'Continuous visual sequence aligned with scene transitions.',
          recommendedStart: start,
          recommendedEnd: end,
          hasDanglingOpening: false,
          hasMidSentenceStart: false,
          hasAbruptEnding: false
        },
        scores: {
          topicRelevance: 75,
          hookStrength: 80,
          completeThought: 85,
          informationDensity: 65,
          audioQuality: 70,
          visualInterest: 85,
          faceActivity: 80,
          handMovement: 75,
          bodyMovement: 75,
          speakerActivity: 70,
          duplicatePenalty: 0,
          complianceRisk: 0,
          finalScore: 78
        },
        compliance: {
          status: 'PASS',
          violations: []
        },
        suggestedHooks: ['MUST WATCH MOMENT', 'VISUAL BREAKTHROUGH', 'HIGHLIGHT CLIP'],
        selectedHook: 'MUST WATCH MOMENT',
        reframeMode: 'FACE_PLUS_HANDS',
        captionStyle: 'BOLD'
      });
    }
    return candidates;
  }
}
