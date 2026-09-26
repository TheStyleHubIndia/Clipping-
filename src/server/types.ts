export type JobState =
  | 'QUEUED'
  | 'DOWNLOADING'
  | 'PROBING'
  | 'EXTRACTING_AUDIO'
  | 'TRANSCRIBING'
  | 'ANALYZING_VIDEO'
  | 'FINDING_CLIPS'
  | 'ANALYZING_VISION'
  | 'SCORING'
  | 'COMPLIANCE_CHECK'
  | 'READY_FOR_REVIEW'
  | 'RENDERING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words: WordTimestamp[];
  avg_logprob?: number;
  no_speech_prob?: number;
}

export interface TranscriptData {
  language: string;
  language_probability: number;
  duration: number;
  full_text: string;
  segments: TranscriptSegment[];
  word_count: number;
}

export interface VisionMetrics {
  face_visibility_ratio: number;
  hand_visibility_ratio: number;
  avg_movement_intensity: number;
}

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
  center_x?: number;
}

export interface VisionFrame {
  frame_idx: number;
  timestamp: number;
  visual_change: number;
  scene_change: boolean;
  faces: Array<{
    bbox: [number, number, number, number];
    center: [number, number];
    norm_center: [number, number];
    size_ratio: number;
  }>;
  face_count: number;
  hands: Array<{
    bbox: [number, number, number, number];
    center: [number, number];
    norm_center: [number, number];
  }>;
  hand_count: number;
  crop_9_16?: CropData;
}

export interface VisionData {
  source: {
    width: number;
    height: number;
    fps: number;
    duration: number;
  };
  crop_dimensions: {
    width: number;
    height: number;
    aspect_ratio: string;
  };
  metrics: VisionMetrics;
  frames: VisionFrame[];
}

export type ReframeMode = 'FACE' | 'FACE_PLUS_HANDS' | 'TWO_SPEAKER' | 'FULL_PERSON' | 'MANUAL';
export type CaptionStyle = 'CLEAN' | 'BOLD' | 'MINIMAL' | 'PODCAST' | 'KARAOKE';

export interface CompleteThoughtAnalysis {
  completeThoughtScore: number; // 0 - 100
  boundaryReason: string;
  recommendedStart: number;
  recommendedEnd: number;
  hasDanglingOpening: boolean;
  hasMidSentenceStart: boolean;
  hasAbruptEnding: boolean;
}

export interface ClipScores {
  topicRelevance: number;
  hookStrength: number;
  completeThought: number;
  informationDensity: number;
  audioQuality: number;
  visualInterest: number;
  faceActivity: number;
  handMovement: number;
  bodyMovement: number;
  speakerActivity: number;
  duplicatePenalty: number;
  complianceRisk: number;
  finalScore: number;
}

export interface ComplianceViolation {
  matchedText: string;
  matchedRule: string;
  severity: 'BLOCK' | 'WARNING';
  reason: string;
  suggestedAction: string;
}

export interface ComplianceResult {
  status: 'PASS' | 'WARNING' | 'BLOCK';
  violations: ComplianceViolation[];
}

export interface CandidateClip {
  id: string;
  title: string;
  summary: string;
  startTime: number;
  endTime: number;
  duration: number;
  transcript: string;
  words: WordTimestamp[];
  completeThought: CompleteThoughtAnalysis;
  scores: ClipScores;
  compliance: ComplianceResult;
  suggestedHooks: string[];
  selectedHook?: string;
  reframeMode: ReframeMode;
  captionStyle: CaptionStyle;
  crop?: CropData;
  renderedFilename?: string;
  renderStatus?: 'PENDING' | 'RENDERING' | 'DONE' | 'FAILED';
  renderError?: string;
}

export interface CustomRegexRule {
  id: string;
  name: string;
  pattern: string;
  action: 'WARNING' | 'BLOCK';
  reason?: string;
  suggestedAction?: string;
}

export interface CampaignProfile {
  id: string;
  name: string;
  isCustom?: boolean;
  allowedTerms: string[];
  prohibitedTerms: string[];
  requiredTerms: string[];
  prohibitedClaimTypes: string[];
  customRules: string[];
  regexRules?: CustomRegexRule[];
}

export interface ProjectMetadata {
  id: string;
  title: string;
  createdAt: string;
  sourceType: 'YOUTUBE' | 'UPLOAD' | 'SAMPLE';
  sourceUrl?: string;
  sourceFilename: string;
  sourcePath: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  userPrompt?: string;
  campaignProfileId?: string;
}

export interface JobProgress {
  id: string;
  projectId: string;
  type: 'ANALYZE_PIPELINE' | 'RENDER_CLIP' | 'BATCH_RENDER';
  state: JobState;
  progressPercent: number;
  currentStep: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  logs: string[];
}

export interface SystemServiceStatus {
  name: string;
  status: 'PASS' | 'WARNING' | 'NOT_INSTALLED';
  version?: string;
  description: string;
  details?: string;
}
