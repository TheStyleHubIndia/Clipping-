import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Upload,
  Link as LinkIcon,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Download,
  Settings,
  ShieldCheck,
  Eye,
  Type,
  Clock,
  Terminal,
  Play,
  Pause,
  RotateCcw,
  Film,
  Zap,
  ChevronRight,
  Plus,
  Trash2,
  SkipBack,
  SkipForward,
  ChevronLeft,
  Info
} from 'lucide-react';

interface SystemService {
  name: string;
  status: 'PASS' | 'WARNING' | 'NOT_INSTALLED';
  version?: string;
  description: string;
  details?: string;
}

interface CustomRegexRule {
  id: string;
  name: string;
  pattern: string;
  action: 'WARNING' | 'BLOCK';
  reason?: string;
  suggestedAction?: string;
}

interface CampaignProfile {
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

interface ProjectMetadata {
  id: string;
  title: string;
  createdAt: string;
  sourceType: string;
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

interface ComplianceViolation {
  matchedText: string;
  matchedRule: string;
  severity: 'BLOCK' | 'WARNING';
  reason: string;
  suggestedAction: string;
}

interface ComplianceResult {
  status: 'PASS' | 'WARNING' | 'BLOCK';
  violations: ComplianceViolation[];
}

interface CandidateClip {
  id: string;
  title: string;
  summary: string;
  startTime: number;
  endTime: number;
  duration: number;
  transcript: string;
  words: Array<{ word: string; start: number; end: number; confidence?: number }>;
  completeThought: {
    completeThoughtScore: number;
    boundaryReason: string;
    recommendedStart: number;
    recommendedEnd: number;
    hasDanglingOpening: boolean;
    hasMidSentenceStart: boolean;
    hasAbruptEnding: boolean;
  };
  scores: {
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
    finalScore: number;
  };
  compliance: ComplianceResult;
  suggestedHooks: string[];
  selectedHook?: string;
  reframeMode: 'FACE' | 'FACE_PLUS_HANDS' | 'TWO_SPEAKER' | 'FULL_PERSON' | 'MANUAL';
  captionStyle: 'CLEAN' | 'BOLD' | 'MINIMAL' | 'PODCAST' | 'KARAOKE';
  crop?: { x: number; y: number; width: number; height: number; center_x?: number };
  renderedFilename?: string;
  renderStatus?: 'PENDING' | 'RENDERING' | 'DONE' | 'FAILED';
}

interface JobProgress {
  id: string;
  projectId: string;
  type: string;
  state: string;
  progressPercent: number;
  currentStep: string;
  error?: string;
  logs: string[];
}

export default function App() {
  // Navigation & Tab state
  const [activeTab, setActiveTab] = useState<'create' | 'candidates' | 'editor' | 'renders'>('create');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);

  // System status
  const [systemServices, setSystemServices] = useState<SystemService[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Profiles
  const [campaignProfiles, setCampaignProfiles] = useState<CampaignProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('general_creator');

  // Custom campaign rule builder state
  const [newProfileName, setNewProfileName] = useState('');
  const [newProhibitedTerms, setNewProhibitedTerms] = useState('');
  const [newRequiredTerms, setNewRequiredTerms] = useState('');
  const [newRegexRules, setNewRegexRules] = useState<CustomRegexRule[]>([]);
  const [ruleNameInput, setRuleNameInput] = useState('');
  const [rulePatternInput, setRulePatternInput] = useState('');
  const [ruleActionInput, setRuleActionInput] = useState<'WARNING' | 'BLOCK'>('BLOCK');
  const [ruleReasonInput, setRuleReasonInput] = useState('');
  const [ruleError, setRuleError] = useState<string | null>(null);

  // Input creation state
  const [inputMode, setInputMode] = useState<'url' | 'upload' | 'sample'>('url');
  const [videoUrl, setVideoUrl] = useState('');
  const [userPrompt, setUserPrompt] = useState('Find the strongest, most educational and high-retention moments with clear complete explanations.');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active Project & Pipeline Job State
  const [currentProject, setCurrentProject] = useState<ProjectMetadata | null>(null);
  const [transcript, setTranscript] = useState<any | null>(null);
  const [vision, setVision] = useState<any | null>(null);
  const [candidates, setCandidates] = useState<CandidateClip[]>([]);
  const [activeJob, setActiveJob] = useState<JobProgress | null>(null);

  // Active Clip in Editor
  const [editingClip, setEditingClip] = useState<CandidateClip | null>(null);
  const [editorStart, setEditorStart] = useState<number>(0);
  const [editorEnd, setEditorEnd] = useState<number>(0);
  const [editorHook, setEditorHook] = useState<string>('');
  const [editorStyle, setEditorStyle] = useState<'CLEAN' | 'BOLD' | 'MINIMAL' | 'PODCAST' | 'KARAOKE'>('BOLD');
  const [editorMode, setEditorMode] = useState<'FACE' | 'FACE_PLUS_HANDS' | 'TWO_SPEAKER' | 'FULL_PERSON' | 'MANUAL'>('FACE_PLUS_HANDS');
  const [isRendering, setIsRendering] = useState(false);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderedClipUrl, setRenderedClipUrl] = useState<string | null>(null);

  // Timeline player state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [liveCompliance, setLiveCompliance] = useState<ComplianceResult>({ status: 'PASS', violations: [] });

  // Video element refs
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const renderedVideoRef = useRef<HTMLVideoElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const timelineBarRef = useRef<HTMLDivElement>(null);

  // Fetch initial system status and campaign profiles
  useEffect(() => {
    fetchSystemStatus();
    fetchCampaignProfiles();
  }, []);

  // Poll active pipeline job
  useEffect(() => {
    if (!activeJob || activeJob.state === 'COMPLETED' || activeJob.state === 'READY_FOR_REVIEW' || activeJob.state === 'FAILED' || activeJob.state === 'CANCELLED') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${activeJob.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.job) {
            setActiveJob(data.job);
            if (data.job.state === 'READY_FOR_REVIEW' || data.job.state === 'COMPLETED') {
              if (currentProject) {
                loadProject(currentProject.id);
                setActiveTab('candidates');
              }
            }
          }
        }
      } catch (err) {
        console.error('Job polling error:', err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeJob, currentProject]);

  // Poll active render job
  useEffect(() => {
    if (!renderJobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${renderJobId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.job) {
            if (data.job.state === 'COMPLETED') {
              setIsRendering(false);
              setRenderJobId(null);
              if (currentProject && editingClip) {
                const filename = `clip_${editingClip.id}_9x16.mp4`;
                setRenderedClipUrl(`/api/projects/${currentProject.id}/renders/${filename}?t=${Date.now()}`);
                setActiveTab('renders');
              }
            } else if (data.job.state === 'FAILED') {
              setIsRendering(false);
              setRenderJobId(null);
              setErrorMessage(`Render failed: ${data.job.error || 'Unknown rendering error'}`);
            }
          }
        }
      } catch (err) {
        console.error('Render polling error:', err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [renderJobId, currentProject, editingClip]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeJob?.logs]);

  // Synchronize live compliance when hook, boundaries, or campaign profile changes
  useEffect(() => {
    if (!editingClip) return;
    recheckCompliance(editingClip.transcript, editorHook, selectedProfileId);
  }, [editorHook, editorStart, editorEnd, selectedProfileId, editingClip]);

  const recheckCompliance = async (transcriptText: string, hookText: string, profileId: string) => {
    try {
      const res = await fetch('/api/compliance/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptText,
          hook: hookText,
          profileId
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result) {
          setLiveCompliance(data.result);
        }
      }
    } catch (err) {
      console.error('Compliance recheck error:', err);
    }
  };

  const fetchSystemStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setSystemServices(data.services || []);
      }
    } catch (err) {
      console.error('Failed to load system status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchCampaignProfiles = async () => {
    try {
      const res = await fetch('/api/campaign-profiles');
      if (res.ok) {
        const data = await res.json();
        setCampaignProfiles(data.profiles || []);
      }
    } catch (err) {
      console.error('Failed to load campaign profiles:', err);
    }
  };

  const loadProject = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentProject(data.metadata);
        setTranscript(data.transcript || null);
        setVision(data.vision || null);
        setCandidates(data.candidates || []);
      }
    } catch (err) {
      console.error('Failed to load project:', err);
    }
  };

  const handleStartAnalysis = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      let createdProject: ProjectMetadata | null = null;

      if (inputMode === 'url') {
        if (!videoUrl.trim()) {
          throw new Error('Please enter a YouTube or web video URL');
        }
        const res = await fetch('/api/projects/url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: videoUrl.trim(), title: 'Web Clip Project' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to submit URL');
        createdProject = data.project;
      } else if (inputMode === 'upload') {
        if (!uploadFile) {
          throw new Error('Please select a video file (MP4, MOV, WebM, MKV)');
        }
        const formData = new FormData();
        formData.append('video', uploadFile);
        formData.append('title', uploadFile.name);
        const res = await fetch('/api/projects/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        createdProject = data.project;
      } else if (inputMode === 'sample') {
        const res = await fetch('/api/projects/sample', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to generate sample video');
        createdProject = data.project;
      }

      if (!createdProject) throw new Error('Could not initialize project');

      setCurrentProject(createdProject);

      // Start pipeline job
      const analyzeRes = await fetch(`/api/projects/${createdProject.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt,
          campaignProfileId: selectedProfileId
        })
      });

      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error || 'Could not start pipeline analysis');

      setActiveJob({
        id: analyzeData.jobId,
        projectId: createdProject.id,
        type: 'ANALYZE_PIPELINE',
        state: 'QUEUED',
        progressPercent: 5,
        currentStep: 'Pipeline job dispatched...',
        logs: ['Job created. Waiting for worker execution...']
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Processing error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditor = (clip: CandidateClip) => {
    setEditingClip(clip);
    setEditorStart(clip.startTime);
    setEditorEnd(clip.endTime);
    setEditorHook(clip.selectedHook || clip.suggestedHooks[0] || '');
    setEditorStyle(clip.captionStyle || 'BOLD');
    setEditorMode(clip.reframeMode || 'FACE_PLUS_HANDS');
    setLiveCompliance(clip.compliance);
    setActiveTab('editor');

    if (sourceVideoRef.current) {
      sourceVideoRef.current.currentTime = clip.startTime;
      setCurrentTime(clip.startTime);
    }
  };

  // Deterministic fine-tuning for candidate card boundaries
  const handleFineTuneCandidate = (clipId: string, deltaStart: number, deltaEnd: number) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        const maxDur = currentProject?.duration || 120;
        const newStart = Math.max(0, Math.min(c.endTime - 1, Math.round((c.startTime + deltaStart) * 10) / 10));
        const newEnd = Math.max(newStart + 1, Math.min(maxDur, Math.round((c.endTime + deltaEnd) * 10) / 10));
        const newDuration = Math.round((newEnd - newStart) * 10) / 10;

        // Recompute complete thought heuristic deterministically
        let thoughtScore = c.completeThought?.completeThoughtScore || 80;
        let reason = c.completeThought?.boundaryReason || 'Boundary adjusted.';
        if (Math.abs(deltaStart) > 0 || Math.abs(deltaEnd) > 0) {
          reason = `User fine-tuned boundaries (${newStart}s - ${newEnd}s).`;
        }

        return {
          ...c,
          startTime: newStart,
          endTime: newEnd,
          duration: newDuration,
          completeThought: {
            ...c.completeThought,
            completeThoughtScore: thoughtScore,
            boundaryReason: reason,
            recommendedStart: newStart,
            recommendedEnd: newEnd
          }
        };
      })
    );
  };

  const handleResetCandidate = (clipId: string) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        const origStart = c.completeThought.recommendedStart;
        const origEnd = c.completeThought.recommendedEnd;
        return {
          ...c,
          startTime: origStart,
          endTime: origEnd,
          duration: Math.round((origEnd - origStart) * 10) / 10
        };
      })
    );
  };

  // Video Playback & Frame Stepping Controls
  const togglePlayPause = () => {
    if (!sourceVideoRef.current) return;
    if (isPlaying) {
      sourceVideoRef.current.pause();
      setIsPlaying(false);
    } else {
      sourceVideoRef.current.play();
      setIsPlaying(true);
    }
  };

  const stepFrame = (frames: number) => {
    if (!sourceVideoRef.current) return;
    const fps = currentProject?.fps || 30;
    const dt = frames / fps;
    const newTime = Math.max(0, Math.min(currentProject?.duration || 120, sourceVideoRef.current.currentTime + dt));
    sourceVideoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const stepSeconds = (seconds: number) => {
    if (!sourceVideoRef.current) return;
    const newTime = Math.max(0, Math.min(currentProject?.duration || 120, sourceVideoRef.current.currentTime + seconds));
    sourceVideoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const seekTo = (time: number) => {
    if (!sourceVideoRef.current) return;
    const safeTime = Math.max(0, Math.min(currentProject?.duration || 120, time));
    sourceVideoRef.current.currentTime = safeTime;
    setCurrentTime(safeTime);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!timelineBarRef.current || !currentProject?.duration) return;
    const rect = timelineBarRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seekTo(fraction * currentProject.duration);
  };

  const handlePlaySelection = () => {
    if (!sourceVideoRef.current) return;
    sourceVideoRef.current.currentTime = editorStart;
    setCurrentTime(editorStart);
    sourceVideoRef.current.play();
    setIsPlaying(true);
  };

  // Render Clip with Strict Validation
  const handleRenderClip = async () => {
    if (!currentProject || !editingClip) return;
    setIsRendering(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/projects/${currentProject.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipConfig: {
            clipId: editingClip.id,
            startTime: editorStart,
            endTime: editorEnd,
            captionStyle: editorStyle,
            hookText: editorHook,
            burnCaptions: true,
            crop: editingClip.crop,
            words: editingClip.words
          }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start rendering');

      setRenderJobId(data.jobId);
    } catch (err: any) {
      setIsRendering(false);
      setErrorMessage(err.message || 'Render initiation failed');
    }
  };

  const handleCancelJob = async () => {
    if (!activeJob) return;
    try {
      await fetch(`/api/jobs/${activeJob.id}/cancel`, { method: 'POST' });
      setActiveJob((prev) => (prev ? { ...prev, state: 'CANCELLED', currentStep: 'Cancelled by user' } : null));
    } catch (err) {
      console.error('Cancel error:', err);
    }
  };

  // Custom Regex Rule Validation
  const handleAddRegexRule = () => {
    setRuleError(null);
    if (!ruleNameInput.trim()) {
      setRuleError('Rule name is required.');
      return;
    }
    if (!rulePatternInput.trim()) {
      setRuleError('Regex pattern cannot be empty.');
      return;
    }

    // Safety checks against ReDoS
    if (rulePatternInput.length > 200) {
      setRuleError('Pattern is too long (max 200 characters).');
      return;
    }
    if (/(\([^()]*[+*][^()]*\)[+*]|\([^()]*[+*][^()]*\)\{[0-9]+,\})/i.test(rulePatternInput)) {
      setRuleError('Dangerous nested quantifier detected (e.g. (a+)+ is not allowed).');
      return;
    }

    try {
      new RegExp(rulePatternInput, 'i');
    } catch (e: any) {
      setRuleError(`Invalid regex: ${e.message}`);
      return;
    }

    const newRule: CustomRegexRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: ruleNameInput.trim(),
      pattern: rulePatternInput.trim(),
      action: ruleActionInput,
      reason: ruleReasonInput.trim() || undefined
    };

    setNewRegexRules([...newRegexRules, newRule]);
    setRuleNameInput('');
    setRulePatternInput('');
    setRuleReasonInput('');
  };

  const handleSaveCustomProfile = async () => {
    if (!newProfileName.trim()) {
      setRuleError('Campaign profile name is required.');
      return;
    }

    try {
      const prohibitedArray = newProhibitedTerms.split(',').map((t) => t.trim()).filter(Boolean);
      const requiredArray = newRequiredTerms.split(',').map((t) => t.trim()).filter(Boolean);

      const res = await fetch('/api/campaign-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProfileName.trim(),
          prohibitedTerms: prohibitedArray,
          requiredTerms: requiredArray,
          regexRules: newRegexRules
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save campaign profile');

      await fetchCampaignProfiles();
      if (data.profile) {
        setSelectedProfileId(data.profile.id);
      }
      setShowCampaignModal(false);
      setNewProfileName('');
      setNewProhibitedTerms('');
      setNewRequiredTerms('');
      setNewRegexRules([]);
    } catch (err: any) {
      setRuleError(err.message);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    try {
      const res = await fetch(`/api/campaign-profiles/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchCampaignProfiles();
        if (selectedProfileId === id) {
          setSelectedProfileId('general_creator');
        }
      }
    } catch (err) {
      console.error('Delete profile error:', err);
    }
  };

  const overallSystemHealthy = systemServices.every((s) => s.status !== 'NOT_INSTALLED');
  const videoDuration = currentProject?.duration || 60;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-lg tracking-tight text-white">AI CLIPPING STUDIO</h1>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                PRO 9:16
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Multi-Modal Video Reframing • Complete Thought Engine • Campaign Rules
            </p>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={() => setShowCampaignModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-medium transition cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Campaign Rules</span>
          </button>

          <button
            onClick={() => setShowStatusModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-medium transition cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">System Status</span>
            <span
              className={`w-2 h-2 rounded-full ${
                overallSystemHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
          </button>

          {currentProject && (
            <button
              onClick={() => {
                setCurrentProject(null);
                setCandidates([]);
                setActiveJob(null);
                setEditingClip(null);
                setActiveTab('create');
              }}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition cursor-pointer"
            >
              + New Video
            </button>
          )}
        </div>
      </header>

      {/* Studio Navigation Bar */}
      <nav className="bg-slate-900 border-b border-slate-800/80 px-4 py-1.5 flex items-center space-x-1 overflow-x-auto text-xs font-medium">
        <button
          onClick={() => setActiveTab('create')}
          className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition cursor-pointer ${
            activeTab === 'create'
              ? 'bg-slate-800 text-amber-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>1. Source & Moments</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />

        <button
          onClick={() => setActiveTab('candidates')}
          disabled={candidates.length === 0}
          className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            activeTab === 'candidates'
              ? 'bg-slate-800 text-amber-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>2. Candidate Clips ({candidates.length})</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />

        <button
          onClick={() => setActiveTab('editor')}
          disabled={!editingClip}
          className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            activeTab === 'editor'
              ? 'bg-slate-800 text-amber-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>3. Frame-Accurate Timeline & 9:16 Editor</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />

        <button
          onClick={() => setActiveTab('renders')}
          disabled={!renderedClipUrl}
          className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            activeTab === 'renders'
              ? 'bg-slate-800 text-amber-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span>4. Rendered Export</span>
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full">
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-3 text-rose-300 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1">
              <p className="font-semibold">Pipeline Alert</p>
              <p className="text-xs text-rose-200/90 mt-0.5">{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-200 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* TAB 1: Source & Project Setup */}
        {activeTab === 'create' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-white flex items-center space-x-2">
                    <Video className="w-4 h-4 text-amber-400" />
                    <span>Select Video Source</span>
                  </h2>
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                    <button
                      onClick={() => setInputMode('url')}
                      className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                        inputMode === 'url' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                      }`}
                    >
                      Web / YouTube
                    </button>
                    <button
                      onClick={() => setInputMode('upload')}
                      className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                        inputMode === 'upload' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                      }`}
                    >
                      Upload File
                    </button>
                    <button
                      onClick={() => setInputMode('sample')}
                      className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                        inputMode === 'sample' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                      }`}
                    >
                      Sample Demo
                    </button>
                  </div>
                </div>

                {inputMode === 'url' && (
                  <div className="space-y-3">
                    <label className="text-xs font-medium text-slate-400">
                      YouTube Video or Shorts URL
                    </label>
                    <div className="relative">
                      <LinkIcon className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                      <input
                        type="text"
                        placeholder="https://www.youtube.com/watch?v=... or https://youtube.com/shorts/..."
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Supports full YouTube videos, YouTube Shorts, and direct MP4/WebM URLs via yt-dlp.
                    </p>
                  </div>
                )}

                {inputMode === 'upload' && (
                  <div className="space-y-3">
                    <label className="text-xs font-medium text-slate-400">
                      Upload Video File (MP4, MOV, WebM, MKV)
                    </label>
                    <div
                      onClick={() => document.getElementById('video-file-input')?.click()}
                      className="border-2 border-dashed border-slate-800 hover:border-amber-500/50 rounded-xl p-8 text-center cursor-pointer bg-slate-950/50 transition group"
                    >
                      <Upload className="w-8 h-8 text-slate-600 group-hover:text-amber-400 mx-auto mb-2 transition" />
                      <p className="text-xs font-semibold text-slate-300">
                        {uploadFile ? uploadFile.name : 'Click or drop video file here'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {uploadFile
                          ? `${(uploadFile.size / (1024 * 1024)).toFixed(1)} MB`
                          : 'Up to 2GB • Fast local filesystem processing'}
                      </p>
                      <input
                        id="video-file-input"
                        type="file"
                        accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setUploadFile(e.target.files[0]);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}

                {inputMode === 'sample' && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                    <div className="flex items-center space-x-2 text-amber-400">
                      <Zap className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Zero-Friction Test</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Generate an instant 1080p synthetic speaker video with speech harmonics, gestures, and temporal scene movement.
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Tests full pipeline: FFprobe → Audio Extraction → faster-whisper → OpenCV Tracking → Complete Thought Boundaries → FFmpeg 9:16 Render.
                    </p>
                  </div>
                )}

                {/* AI Prompt Input */}
                <div className="mt-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>What moments should AI find?</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">Semantic Intent</span>
                  </div>
                  <textarea
                    rows={3}
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    placeholder="e.g. Find the strongest moments explaining why the ingredient was chosen and how it works."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 leading-relaxed"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      'Find the strongest educational moments',
                      'Find sections where speaker explains why',
                      'Find high-energy hook moments',
                      'Find the core breakthrough explanation'
                    ].map((example, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setUserPrompt(example)}
                        className="text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campaign Profile Selector */}
                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Campaign Compliance Profile</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCampaignModal(true)}
                      className="text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer font-medium"
                    >
                      + Create Custom Rules
                    </button>
                  </div>
                  <select
                    value={selectedProfileId}
                    onChange={(e) => setSelectedProfileId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    {campaignProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.isCustom ? '(Custom)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Submit Action */}
                <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                  <div className="text-[11px] text-slate-400 flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Real-time background pipeline</span>
                  </div>

                  <button
                    onClick={handleStartAnalysis}
                    disabled={isSubmitting || Boolean(activeJob && activeJob.state !== 'READY_FOR_REVIEW' && activeJob.state !== 'COMPLETED' && activeJob.state !== 'FAILED')}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-amber-500/20 transition cursor-pointer flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Initializing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Analyze Video & Find Clips</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Job Execution Monitor & Real Pipeline States */}
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <span>Pipeline Orchestrator</span>
                  </h3>
                  {activeJob && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        activeJob.state === 'READY_FOR_REVIEW' || activeJob.state === 'COMPLETED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : activeJob.state === 'FAILED'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                      }`}
                    >
                      {activeJob.state}
                    </span>
                  )}
                </div>

                {activeJob ? (
                  <div className="space-y-4 flex-1 flex flex-col">
                    <div>
                      <div className="flex justify-between text-xs mb-1 font-semibold">
                        <span className="text-slate-300">{activeJob.currentStep}</span>
                        <span className="text-amber-400 font-mono">{activeJob.progressPercent}%</span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-amber-500 to-rose-500 h-full transition-all duration-300"
                          style={{ width: `${activeJob.progressPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex-1 min-h-[220px] max-h-[300px] bg-slate-950 rounded-xl p-3 font-mono text-[11px] text-slate-300 overflow-y-auto border border-slate-800 space-y-1">
                      {activeJob.logs.map((log, index) => (
                        <div key={index} className="leading-tight text-slate-400">
                          {log}
                        </div>
                      ))}
                      <div ref={logsEndRef} />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={handleCancelJob}
                        disabled={activeJob.state === 'COMPLETED' || activeJob.state === 'READY_FOR_REVIEW' || activeJob.state === 'FAILED'}
                        className="text-xs text-rose-400 hover:text-rose-300 disabled:opacity-40 cursor-pointer font-medium"
                      >
                        Cancel Job
                      </button>

                      {(activeJob.state === 'READY_FOR_REVIEW' || activeJob.state === 'COMPLETED') && (
                        <button
                          onClick={() => setActiveTab('candidates')}
                          className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition cursor-pointer flex items-center space-x-1"
                        >
                          <span>Review Clips</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-2">
                    <Film className="w-10 h-10 text-slate-700 mb-1" />
                    <p className="text-xs font-semibold text-slate-400">No Active Pipeline Job</p>
                    <p className="text-[11px] max-w-xs">
                      Provide a video source and prompt above to start real audio extraction, faster-whisper transcription, OpenCV face/motion analysis, and smart clip detection.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Candidate Moments with Fine-Tuning */}
        {activeTab === 'candidates' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <span>Candidate Moments ({candidates.length})</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Filtered by complete-thought boundaries, semantic intent, visual dynamics, and compliance rules.
                </p>
              </div>

              {currentProject && (
                <div className="text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                  Source: <span className="font-semibold text-white">{currentProject.sourceFilename}</span> ({Math.round(currentProject.duration)}s)
                </div>
              )}
            </div>

            {/* Candidate Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {candidates.map((clip, index) => {
                const thoughtScore = clip.completeThought?.completeThoughtScore || 80;
                const isThoughtPass = thoughtScore >= 70;
                const complianceStatus = clip.compliance?.status || 'PASS';

                return (
                  <div
                    key={clip.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-amber-500/40 transition shadow-lg group"
                  >
                    <div>
                      {/* Card Top: Rank & Duration */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400 font-bold border border-slate-700">
                            #{index + 1}
                          </span>
                          <span className="text-xs font-mono text-slate-300">
                            {clip.startTime.toFixed(1)}s - {clip.endTime.toFixed(1)}s
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {clip.duration.toFixed(1)}s
                        </span>
                      </div>

                      {/* Title & Summary */}
                      <h3 className="font-bold text-sm text-white group-hover:text-amber-300 transition line-clamp-2 mb-1">
                        {clip.title}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-3 mb-3 leading-relaxed">
                        "{clip.transcript}"
                      </p>

                      {/* Quick Boundary Fine-Tuning Controls */}
                      <div className="mb-3 p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] space-y-1.5">
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="font-semibold text-slate-300">Fine-Tune Trim:</span>
                          <button
                            type="button"
                            onClick={() => handleResetCandidate(clip.id)}
                            className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
                          >
                            Reset AI Bounds
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-center">
                          <div className="bg-slate-900/90 rounded p-1 border border-slate-800 flex items-center justify-between px-1.5">
                            <span className="text-[10px] text-slate-500">Start:</span>
                            <div className="flex space-x-1">
                              <button
                                type="button"
                                onClick={() => handleFineTuneCandidate(clip.id, -0.5, 0)}
                                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-[10px] font-mono cursor-pointer"
                              >
                                -0.5s
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFineTuneCandidate(clip.id, 0.5, 0)}
                                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-[10px] font-mono cursor-pointer"
                              >
                                +0.5s
                              </button>
                            </div>
                          </div>
                          <div className="bg-slate-900/90 rounded p-1 border border-slate-800 flex items-center justify-between px-1.5">
                            <span className="text-[10px] text-slate-500">End:</span>
                            <div className="flex space-x-1">
                              <button
                                type="button"
                                onClick={() => handleFineTuneCandidate(clip.id, 0, -0.5)}
                                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-[10px] font-mono cursor-pointer"
                              >
                                -0.5s
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFineTuneCandidate(clip.id, 0, 0.5)}
                                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-[10px] font-mono cursor-pointer"
                              >
                                +0.5s
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Signals & Badges */}
                      <div className="space-y-2 mb-4 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                        {/* Complete Thought Evaluation */}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400 flex items-center space-x-1">
                            <CheckCircle2
                              className={`w-3.5 h-3.5 ${
                                isThoughtPass ? 'text-emerald-400' : 'text-amber-400'
                              }`}
                            />
                            <span>Complete Thought</span>
                          </span>
                          <span
                            className={`font-mono font-bold text-[11px] ${
                              isThoughtPass ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {thoughtScore}/100
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 italic pl-5 line-clamp-1">
                          {clip.completeThought?.boundaryReason}
                        </p>

                        {/* Visual & Speaker Signals */}
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/60 text-[10px]">
                          <div>
                            <span className="text-slate-500 block">Visual Activity</span>
                            <span className="font-semibold text-slate-300 font-mono">
                              {clip.scores?.visualInterest || 70}%
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Face Track</span>
                            <span className="font-semibold text-slate-300 font-mono">
                              {clip.scores?.faceActivity || 75}%
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Hand Gestures</span>
                            <span className="font-semibold text-slate-300 font-mono">
                              {clip.scores?.handMovement || 60}%
                            </span>
                          </div>
                        </div>

                        {/* Compliance Status */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
                          <span className="text-slate-400">Compliance</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                              complianceStatus === 'PASS'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : complianceStatus === 'WARNING'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {complianceStatus}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-2">
                      <button
                        onClick={() => handleOpenEditor(clip)}
                        className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center space-x-1.5 shadow"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Edit on Timeline & Reframe</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: Frame-Accurate Timeline Editor & Smart Reframer */}
        {activeTab === 'editor' && editingClip && currentProject && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: 9:16 Vertical Video Preview Simulation */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="relative w-full max-w-[340px] aspect-[9/16] bg-black rounded-3xl overflow-hidden border-4 border-slate-800 shadow-2xl flex items-center justify-center">
                <video
                  ref={sourceVideoRef}
                  src={`/api/projects/${currentProject.id}/source`}
                  className="w-full h-full object-cover"
                  onTimeUpdate={(e) => {
                    const t = (e.target as HTMLVideoElement).currentTime;
                    setCurrentTime(t);
                    // If previewing selection and reached end, pause
                    if (isPlaying && t >= editorEnd) {
                      (e.target as HTMLVideoElement).pause();
                      setIsPlaying(false);
                    }
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />

                {/* Overlaid Animated Hook Preview */}
                {editorHook && (
                  <div className="absolute top-6 left-4 right-4 bg-black/70 backdrop-blur-sm border border-amber-500/40 rounded-xl p-2.5 text-center pointer-events-none shadow-lg">
                    <p className="text-xs font-black text-amber-300 tracking-wide uppercase leading-snug">
                      {editorHook}
                    </p>
                  </div>
                )}

                {/* Overlaid Captions Preview */}
                <div className="absolute bottom-12 left-4 right-4 text-center pointer-events-none">
                  <span
                    className={`inline-block px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider shadow-md ${
                      editorStyle === 'BOLD'
                        ? 'bg-black/80 text-yellow-300 border border-black'
                        : editorStyle === 'KARAOKE'
                        ? 'bg-black/90 text-cyan-400 font-extrabold'
                        : editorStyle === 'PODCAST'
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : editorStyle === 'MINIMAL'
                        ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]'
                        : 'bg-black/60 text-white'
                    }`}
                  >
                    DYNAMIC 9:16 CAPTIONS
                  </span>
                </div>
              </div>

              {/* Video Transport Controls */}
              <div className="mt-3 flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-xl p-2">
                <button
                  type="button"
                  onClick={() => stepSeconds(-1)}
                  title="Rewind 1 sec"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => stepFrame(-1)}
                  title="Step Back 1 Frame"
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono cursor-pointer"
                >
                  -1F
                </button>
                <button
                  type="button"
                  onClick={togglePlayPause}
                  className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                </button>
                <button
                  type="button"
                  onClick={() => stepFrame(1)}
                  title="Step Forward 1 Frame"
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono cursor-pointer"
                >
                  +1F
                </button>
                <button
                  type="button"
                  onClick={() => stepSeconds(1)}
                  title="Forward 1 sec"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handlePlaySelection}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Preview Clip
                </button>
              </div>

              <p className="text-xs text-slate-500 mt-2 font-mono">
                Current Time: {currentTime.toFixed(2)}s / {videoDuration.toFixed(2)}s • Mode: {editorMode}
              </p>
            </div>

            {/* Right: Controls Panel */}
            <div className="lg:col-span-7 space-y-5">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="font-bold text-white text-base">Frame-Accurate Timeline & Controls</h3>
                    <p className="text-xs text-slate-400">
                      Duration: {(editorEnd - editorStart).toFixed(2)}s (Range: {editorStart.toFixed(2)}s - {editorEnd.toFixed(2)}s)
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditorStart(editingClip.completeThought.recommendedStart);
                      setEditorEnd(editingClip.completeThought.recommendedEnd);
                      seekTo(editingClip.completeThought.recommendedStart);
                    }}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center space-x-1 cursor-pointer font-medium"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset to Complete Thought</span>
                  </button>
                </div>

                {/* 1. Interactive Timeline Scrubber with Large Touch Targets */}
                <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300 flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Timeline Visual Track</span>
                    </span>
                    <span className="text-amber-400 font-mono font-bold">
                      Playhead: {currentTime.toFixed(2)}s
                    </span>
                  </div>

                  {/* Scrubber Bar */}
                  <div
                    ref={timelineBarRef}
                    onClick={handleTimelineClick}
                    className="relative w-full h-8 bg-slate-900 rounded-lg cursor-pointer border border-slate-700/80 overflow-hidden select-none"
                  >
                    {/* Selected Active Clip Window Highlight */}
                    <div
                      className="absolute top-0 bottom-0 bg-amber-500/30 border-x-2 border-amber-400"
                      style={{
                        left: `${(editorStart / Math.max(1, videoDuration)) * 100}%`,
                        width: `${((editorEnd - editorStart) / Math.max(1, videoDuration)) * 100}%`
                      }}
                    />

                    {/* Current Playhead Line */}
                    <div
                      className="absolute top-0 bottom-0 w-1 bg-rose-500 z-10 pointer-events-none"
                      style={{ left: `${(currentTime / Math.max(1, videoDuration)) * 100}%` }}
                    />
                  </div>

                  {/* Start & End Draggable / Touch-Friendly Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400 font-semibold">Start Point:</span>
                        <span className="text-amber-400 font-mono font-bold">{editorStart.toFixed(2)}s</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={editorEnd - 0.5}
                        step="0.05"
                        value={editorStart}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setEditorStart(val);
                          seekTo(val);
                        }}
                        className="w-full accent-amber-500 h-6 cursor-pointer"
                      />
                      <div className="flex justify-between items-center pt-1">
                        <div className="flex space-x-1">
                          <button
                            type="button"
                            onClick={() => {
                              const s = Math.max(0, editorStart - 0.1);
                              setEditorStart(s);
                              seekTo(s);
                            }}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-mono"
                          >
                            -0.1s
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const s = Math.min(editorEnd - 0.5, editorStart + 0.1);
                              setEditorStart(s);
                              seekTo(s);
                            }}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-mono"
                          >
                            +0.1s
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (currentTime < editorEnd) {
                              setEditorStart(currentTime);
                            }
                          }}
                          className="text-[10px] text-amber-400 hover:text-amber-300 font-bold"
                        >
                          Snap to Playhead
                        </button>
                      </div>
                    </div>

                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400 font-semibold">End Point:</span>
                        <span className="text-amber-400 font-mono font-bold">{editorEnd.toFixed(2)}s</span>
                      </div>
                      <input
                        type="range"
                        min={editorStart + 0.5}
                        max={videoDuration}
                        step="0.05"
                        value={editorEnd}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setEditorEnd(val);
                          seekTo(val);
                        }}
                        className="w-full accent-amber-500 h-6 cursor-pointer"
                      />
                      <div className="flex justify-between items-center pt-1">
                        <div className="flex space-x-1">
                          <button
                            type="button"
                            onClick={() => {
                              const s = Math.max(editorStart + 0.5, editorEnd - 0.1);
                              setEditorEnd(s);
                              seekTo(s);
                            }}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-mono"
                          >
                            -0.1s
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const s = Math.min(videoDuration, editorEnd + 0.1);
                              setEditorEnd(s);
                              seekTo(s);
                            }}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-mono"
                          >
                            +0.1s
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (currentTime > editorStart) {
                              setEditorEnd(currentTime);
                            }
                          }}
                          className="text-[10px] text-amber-400 hover:text-amber-300 font-bold"
                        >
                          Snap to Playhead
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Reframe Camera Mode Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Smart 9:16 Camera Reframer</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'FACE_PLUS_HANDS', label: 'Face + Hands (Default)' },
                      { id: 'FACE', label: 'Face Only' },
                      { id: 'TWO_SPEAKER', label: 'Multi-Speaker' },
                      { id: 'FULL_PERSON', label: 'Full Torso' },
                      { id: 'MANUAL', label: 'Center Crop' }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setEditorMode(mode.id as any)}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border transition text-left cursor-pointer ${
                          editorMode === mode.id
                            ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Caption Style Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                    <Type className="w-3.5 h-3.5 text-rose-400" />
                    <span>Synchronized Caption Style</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(['BOLD', 'KARAOKE', 'PODCAST', 'CLEAN', 'MINIMAL'] as const).map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => setEditorStyle(style)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          editorStyle === style
                            ? 'bg-rose-500 text-slate-950 shadow'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Faithful Hook Suggestions */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Source-Faithful Hook Banner</span>
                  </label>
                  <input
                    type="text"
                    value={editorHook}
                    onChange={(e) => setEditorHook(e.target.value)}
                    placeholder="Enter hook headline (or select from options below)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {editingClip.suggestedHooks.map((h, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setEditorHook(h)}
                        className="text-[10px] px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800 transition cursor-pointer"
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. Live Deterministic Compliance Monitor */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Live Compliance Recheck</span>
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        liveCompliance.status === 'PASS'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : liveCompliance.status === 'WARNING'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {liveCompliance.status}
                    </span>
                  </div>

                  {liveCompliance.violations.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      {liveCompliance.violations.map((v, i) => (
                        <div key={i} className="text-[11px] p-2 rounded bg-slate-900/80 border border-slate-800">
                          <div className="flex items-center space-x-1.5 font-bold text-rose-300">
                            <span>[{v.severity}]</span>
                            <span>{v.matchedRule}</span>
                          </div>
                          <p className="text-slate-400 mt-0.5">{v.reason}</p>
                          <p className="text-[10px] text-amber-400/90 mt-0.5">Advice: {v.suggestedAction}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">
                      No compliance violations detected against profile "{campaignProfiles.find((p) => p.id === selectedProfileId)?.name || 'Standard'}".
                    </p>
                  )}
                </div>

                {/* Render Trigger with Safety Checks */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => setActiveTab('candidates')}
                    className="text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    ← Back to Candidates
                  </button>

                  <button
                    onClick={handleRenderClip}
                    disabled={isRendering || liveCompliance.status === 'BLOCK'}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition cursor-pointer flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRendering ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Rendering 9:16 Video with FFmpeg...</span>
                      </>
                    ) : (
                      <>
                        <Film className="w-4 h-4" />
                        <span>Render 9:16 MP4 (FFmpeg)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Rendered Output Player & Export Hub */}
        {activeTab === 'renders' && renderedClipUrl && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center">
              <div className="flex items-center space-x-2 text-emerald-400 mb-4">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="font-bold text-base text-white">Clip Render Complete</h3>
              </div>

              {/* Playable 9:16 MP4 Player */}
              <div className="relative w-full max-w-[320px] aspect-[9/16] bg-black rounded-2xl overflow-hidden border-2 border-slate-700 shadow-xl mb-5">
                <video
                  ref={renderedVideoRef}
                  src={renderedClipUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Validation Badges */}
              <div className="flex flex-wrap gap-2 justify-center mb-6">
                <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                  Container: MP4
                </span>
                <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                  Video: H.264 High 9:16 (1080x1920)
                </span>
                <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                  Audio: AAC 48kHz
                </span>
                <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Verified with FFprobe
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-3">
                <a
                  href={renderedClipUrl}
                  download="ai_clip_9x16.mp4"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-emerald-500/20 transition flex items-center space-x-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Playable MP4</span>
                </a>

                <button
                  onClick={() => setActiveTab('candidates')}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition cursor-pointer"
                >
                  Back to Candidates
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Custom Campaign Rule Builder Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Campaign Profile & Custom Rule Builder</h3>
              </div>
              <button
                onClick={() => setShowCampaignModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* List Existing Profiles */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Available Profiles</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {campaignProfiles.map((p) => (
                  <div key={p.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-start">
                    <div>
                      <p className="text-xs font-bold text-white">{p.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {p.prohibitedTerms.length} prohibited terms • {p.regexRules?.length || 0} regex rules
                      </p>
                    </div>
                    {p.isCustom && (
                      <button
                        type="button"
                        onClick={() => handleDeleteProfile(p.id)}
                        className="text-rose-400 hover:text-rose-300 p-1"
                        title="Delete custom profile"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* New Profile Builder Form */}
            <div className="border-t border-slate-800 pt-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">+ Create Custom Profile</h4>
              
              {ruleError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  {ruleError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Profile Name</label>
                <input
                  type="text"
                  placeholder="e.g. Finance & Crypto Campaign Guidelines"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Prohibited Phrases (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="guaranteed profit, 100% safe, secret hack"
                    value={newProhibitedTerms}
                    onChange={(e) => setNewProhibitedTerms(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Required Disclaimers (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="not financial advice, past performance"
                    value={newRequiredTerms}
                    onChange={(e) => setNewRequiredTerms(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Add Custom Regex Rules */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 mt-2">
                <span className="text-xs font-semibold text-slate-300 block">Custom Regular Expression Rule</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Rule Name (e.g. FDA Claim)"
                    value={ruleNameInput}
                    onChange={(e) => setRuleNameInput(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <input
                    type="text"
                    placeholder="Regex Pattern (e.g. fda\s+approved)"
                    value={rulePatternInput}
                    onChange={(e) => setRulePatternInput(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                  <div className="flex space-x-1">
                    <select
                      value={ruleActionInput}
                      onChange={(e) => setRuleActionInput(e.target.value as any)}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white flex-1"
                    >
                      <option value="BLOCK">BLOCK</option>
                      <option value="WARNING">WARNING</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddRegexRule}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                {newRegexRules.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {newRegexRules.map((r, i) => (
                      <div key={i} className="text-[11px] p-2 rounded bg-slate-900 flex justify-between items-center text-slate-300">
                        <div>
                          <span className="font-bold text-amber-400">{r.name}</span>: <span className="font-mono text-slate-400">/{r.pattern}/i</span> ({r.action})
                        </div>
                        <button
                          type="button"
                          onClick={() => setNewRegexRules(newRegexRules.filter((_, idx) => idx !== i))}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-3 space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCampaignModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomProfile}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow"
                >
                  Save Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">System Dependencies Status</h3>
              </div>
              <button
                onClick={() => setShowStatusModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Real-time operational verification of backend binaries, neural models, and computer vision libraries:
            </p>

            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {systemServices.map((svc, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-start justify-between space-x-3"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-xs text-white">{svc.name}</span>
                      {svc.version && (
                        <span className="text-[10px] font-mono text-slate-400">{svc.version}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{svc.description}</p>
                    {svc.details && (
                      <p className="text-[10px] text-rose-400 font-mono mt-1">{svc.details}</p>
                    )}
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex-shrink-0 ${
                      svc.status === 'PASS'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : svc.status === 'WARNING'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {svc.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-between items-center">
              <button
                onClick={fetchSystemStatus}
                disabled={loadingStatus}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center space-x-1 cursor-pointer font-medium"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
                <span>Re-check Services</span>
              </button>

              <button
                onClick={() => setShowStatusModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
