import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  CandidateClip,
  JobProgress,
  JobState,
  ProjectMetadata,
  TranscriptData,
  VisionData,
  CampaignProfile
} from './types';
import { CandidateFinder } from './candidateFinder';
import { DEFAULT_CAMPAIGN_PROFILES, ComplianceEngine } from './complianceEngine';

export class JobManager {
  private static jobs: Map<string, JobProgress> = new Map();
  private static activeProcesses: Map<string, any> = new Map();
  private static projectsDir = path.resolve(process.cwd(), 'projects');
  private static exportsDir = path.resolve(process.cwd(), 'exports');
  private static profilesPath = path.resolve(process.cwd(), 'projects', 'campaign_profiles.json');

  static init() {
    fs.mkdirSync(this.projectsDir, { recursive: true });
    fs.mkdirSync(this.exportsDir, { recursive: true });
    if (!fs.existsSync(this.profilesPath)) {
      fs.writeFileSync(this.profilesPath, JSON.stringify(DEFAULT_CAMPAIGN_PROFILES, null, 2), 'utf-8');
    }
  }

  static getCampaignProfiles(): CampaignProfile[] {
    this.init();
    try {
      if (fs.existsSync(this.profilesPath)) {
        const custom = JSON.parse(fs.readFileSync(this.profilesPath, 'utf-8'));
        if (Array.isArray(custom)) return custom;
      }
    } catch {
      // fallback
    }
    return DEFAULT_CAMPAIGN_PROFILES;
  }

  static saveCampaignProfile(profile: Partial<CampaignProfile>): { success: boolean; profile?: CampaignProfile; error?: string } {
    this.init();
    if (!profile.name || !profile.name.trim()) {
      return { success: false, error: 'Campaign profile name is required.' };
    }

    // Validate any regex rules included
    const validatedRegexRules = [];
    if (profile.regexRules && Array.isArray(profile.regexRules)) {
      for (const r of profile.regexRules) {
        if (!r.pattern || !r.name) continue;
        const check = ComplianceEngine.validateRegexPattern(r.pattern);
        if (!check.valid) {
          return { success: false, error: `Invalid rule "${r.name}": ${check.error}` };
        }
        validatedRegexRules.push({
          id: r.id || `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: r.name.trim(),
          pattern: r.pattern.trim(),
          action: r.action === 'BLOCK' ? 'BLOCK' : 'WARNING',
          reason: r.reason?.trim() || undefined,
          suggestedAction: r.suggestedAction?.trim() || undefined
        });
      }
    }

    const currentProfiles = this.getCampaignProfiles();
    const id = profile.id || `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    
    const newProfile: CampaignProfile = {
      id,
      name: profile.name.trim(),
      isCustom: true,
      allowedTerms: (profile.allowedTerms || []).map((t) => t.trim()).filter(Boolean),
      prohibitedTerms: (profile.prohibitedTerms || []).map((t) => t.trim()).filter(Boolean),
      requiredTerms: (profile.requiredTerms || []).map((t) => t.trim()).filter(Boolean),
      prohibitedClaimTypes: profile.prohibitedClaimTypes || [],
      customRules: (profile.customRules || []).map((r) => r.trim()).filter(Boolean),
      regexRules: validatedRegexRules
    };

    const existingIndex = currentProfiles.findIndex((p) => p.id === id);
    if (existingIndex >= 0) {
      currentProfiles[existingIndex] = newProfile;
    } else {
      currentProfiles.push(newProfile);
    }

    fs.writeFileSync(this.profilesPath, JSON.stringify(currentProfiles, null, 2), 'utf-8');
    return { success: true, profile: newProfile };
  }

  static deleteCampaignProfile(profileId: string): boolean {
    this.init();
    // Do not delete default built-in profiles
    const defaultIds = ['general_creator', 'health_wellness', 'education_tech'];
    if (defaultIds.includes(profileId)) return false;

    const current = this.getCampaignProfiles();
    const filtered = current.filter((p) => p.id !== profileId);
    fs.writeFileSync(this.profilesPath, JSON.stringify(filtered, null, 2), 'utf-8');
    return true;
  }

  static getJob(jobId: string): JobProgress | undefined {
    return this.jobs.get(jobId);
  }

  static cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    const proc = this.activeProcesses.get(jobId);
    if (proc) {
      try {
        proc.kill('SIGTERM');
      } catch (e) {
        // ignore
      }
      this.activeProcesses.delete(jobId);
    }

    job.state = 'CANCELLED';
    job.currentStep = 'Job was cancelled by user request';
    job.updatedAt = new Date().toISOString();
    return true;
  }

  static createProject(meta: Partial<ProjectMetadata>): ProjectMetadata {
    const id = meta.id || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const projDir = path.join(this.projectsDir, id);

    // Create required project directory structure
    const subdirs = [
      'source',
      'metadata',
      'audio',
      'transcript',
      'vision',
      'candidates',
      'clips',
      'renders',
      'logs'
    ];
    for (const sub of subdirs) {
      fs.mkdirSync(path.join(projDir, sub), { recursive: true });
    }

    const project: ProjectMetadata = {
      id,
      title: meta.title || 'Untitled Video Project',
      createdAt: new Date().toISOString(),
      sourceType: meta.sourceType || 'UPLOAD',
      sourceUrl: meta.sourceUrl,
      sourceFilename: meta.sourceFilename || 'source.mp4',
      sourcePath: meta.sourcePath || path.join(projDir, 'source', meta.sourceFilename || 'source.mp4'),
      duration: meta.duration || 0,
      width: meta.width || 1920,
      height: meta.height || 1080,
      fps: meta.fps || 30,
      hasAudio: meta.hasAudio !== undefined ? meta.hasAudio : true,
      userPrompt: meta.userPrompt || '',
      campaignProfileId: meta.campaignProfileId || 'general_creator'
    };

    fs.writeFileSync(
      path.join(projDir, 'metadata', 'project.json'),
      JSON.stringify(project, null, 2),
      'utf-8'
    );

    return project;
  }

  static getProject(projectId: string): {
    metadata: ProjectMetadata;
    transcript?: TranscriptData;
    vision?: VisionData;
    candidates?: CandidateClip[];
  } | null {
    // Sanitize project ID to prevent path traversal
    const safeId = path.basename(projectId);
    const projDir = path.join(this.projectsDir, safeId);
    const metaPath = path.join(projDir, 'metadata', 'project.json');

    if (!fs.existsSync(metaPath)) return null;

    try {
      const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      let transcript: TranscriptData | undefined;
      let vision: VisionData | undefined;
      let candidates: CandidateClip[] | undefined;

      const tPath = path.join(projDir, 'transcript', 'transcript.json');
      if (fs.existsSync(tPath)) {
        transcript = JSON.parse(fs.readFileSync(tPath, 'utf-8'));
      }

      const vPath = path.join(projDir, 'vision', 'vision_data.json');
      if (fs.existsSync(vPath)) {
        vision = JSON.parse(fs.readFileSync(vPath, 'utf-8'));
      }

      const cPath = path.join(projDir, 'candidates', 'candidates.json');
      if (fs.existsSync(cPath)) {
        candidates = JSON.parse(fs.readFileSync(cPath, 'utf-8'));
      }

      return { metadata, transcript, vision, candidates };
    } catch (e) {
      console.error(`Error reading project ${safeId}:`, e);
      return null;
    }
  }

  static listProjects(): ProjectMetadata[] {
    this.init();
    const dirs = fs.readdirSync(this.projectsDir);
    const list: ProjectMetadata[] = [];
    for (const d of dirs) {
      const metaPath = path.join(this.projectsDir, d, 'metadata', 'project.json');
      if (fs.existsSync(metaPath)) {
        try {
          const item = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          list.push(item);
        } catch (e) {
          // ignore invalid
        }
      }
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Starts full asynchronous pipeline processing:
   * DOWNLOADING (if url) -> PROBING -> EXTRACTING_AUDIO -> TRANSCRIBING -> ANALYZING_VISION -> FINDING_CLIPS -> SCORING -> COMPLIANCE -> READY_FOR_REVIEW
   */
  static startPipelineJob(projectId: string, userPrompt: string = '', campaignProfileId: string = 'general_creator'): string {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const job: JobProgress = {
      id: jobId,
      projectId,
      type: 'ANALYZE_PIPELINE',
      state: 'QUEUED',
      progressPercent: 0,
      currentStep: 'Initializing job pipeline...',
      startedAt: now,
      updatedAt: now,
      logs: [`[${now}] Job ${jobId} queued for project ${projectId}`]
    };

    this.jobs.set(jobId, job);

    // Run async pipeline orchestrator in background
    setTimeout(() => {
      this.executePipeline(jobId, projectId, userPrompt, campaignProfileId);
    }, 10);

    return jobId;
  }

  private static log(job: JobProgress, message: string) {
    const entry = `[${new Date().toLocaleTimeString()}] ${message}`;
    job.logs.push(entry);
    job.updatedAt = new Date().toISOString();
    // Keep last 150 log entries
    if (job.logs.length > 150) job.logs.shift();
  }

  private static async executePipeline(
    jobId: string,
    projectId: string,
    userPrompt: string,
    campaignProfileId: string
  ) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const projDir = path.join(this.projectsDir, path.basename(projectId));
    const metaPath = path.join(projDir, 'metadata', 'project.json');
    if (!fs.existsSync(metaPath)) {
      job.state = 'FAILED';
      job.error = 'Project metadata not found';
      return;
    }

    const metadata: ProjectMetadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    metadata.userPrompt = userPrompt;
    metadata.campaignProfileId = campaignProfileId;

    try {
      // 1. Download if URL
      if (metadata.sourceType === 'YOUTUBE' && metadata.sourceUrl && !fs.existsSync(metadata.sourcePath)) {
        job.state = 'DOWNLOADING';
        job.progressPercent = 10;
        job.currentStep = 'Downloading video via yt-dlp...';
        this.log(job, `Fetching media from: ${metadata.sourceUrl}`);

        const dlResult = await this.runPythonScript('pipeline/downloader.py', [
          metadata.sourceUrl,
          path.join(projDir, 'source')
        ]);

        if (dlResult.error) {
          throw new Error(`Download failed: ${dlResult.error}`);
        }
        metadata.sourcePath = dlResult.file_path;
        metadata.sourceFilename = dlResult.filename;
        metadata.title = dlResult.title || metadata.title;
        this.log(job, `Download completed: ${dlResult.filename}`);
      }

      // 2. Probe Media
      job.state = 'PROBING';
      job.progressPercent = 20;
      job.currentStep = 'Inspecting video format and streams with FFprobe...';
      this.log(job, `Probing media container: ${path.basename(metadata.sourcePath)}`);

      const probeResult = await this.runPythonScript('pipeline/media_probe.py', [metadata.sourcePath]);
      if (probeResult.error) {
        throw new Error(`FFprobe error: ${probeResult.error}`);
      }

      metadata.duration = probeResult.duration;
      metadata.width = probeResult.width;
      metadata.height = probeResult.height;
      metadata.fps = probeResult.fps;
      metadata.hasAudio = probeResult.has_audio;
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
      this.log(job, `Media probed: ${probeResult.width}x${probeResult.height} @ ${probeResult.fps}fps, duration: ${probeResult.duration}s`);

      // 3. Extract Audio
      const audioPath = path.join(projDir, 'audio', 'audio_16k.wav');
      job.state = 'EXTRACTING_AUDIO';
      job.progressPercent = 30;
      job.currentStep = 'Extracting normalized 16kHz speech audio...';
      this.log(job, 'Extracting audio track for transcription...');

      if (metadata.hasAudio) {
        const audioRes = await this.runPythonScript('pipeline/audio_extractor.py', [
          metadata.sourcePath,
          audioPath
        ]);
        if (audioRes.error) {
          this.log(job, `Audio extraction warning: ${audioRes.error}`);
        } else {
          this.log(job, `Audio extracted successfully: ${Math.round(audioRes.size_bytes / 1024)} KB`);
        }
      }

      // 4. Transcription (faster-whisper)
      const transcriptPath = path.join(projDir, 'transcript', 'transcript.json');
      let transcriptData: TranscriptData;

      if (fs.existsSync(transcriptPath)) {
        job.state = 'TRANSCRIBING';
        job.progressPercent = 45;
        job.currentStep = 'Loading cached transcript...';
        this.log(job, 'Found cached transcript on disk.');
        transcriptData = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
      } else if (metadata.hasAudio && fs.existsSync(audioPath)) {
        job.state = 'TRANSCRIBING';
        job.progressPercent = 40;
        job.currentStep = 'Transcribing with faster-whisper (word timestamps)...';
        this.log(job, 'Running faster-whisper neural transcription...');

        const tRes = await this.runPythonScript('pipeline/transcriber.py', [
          audioPath,
          transcriptPath,
          'tiny'
        ]);

        if (tRes.error) {
          this.log(job, `Transcription warning: ${tRes.error}`);
          transcriptData = {
            language: 'unknown',
            language_probability: 0,
            duration: metadata.duration,
            full_text: '',
            segments: [],
            word_count: 0
          };
        } else {
          transcriptData = tRes.data || JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
          this.log(
            job,
            `Transcription finished: ${transcriptData.segments.length} segments, ${transcriptData.word_count} words (Lang: ${transcriptData.language})`
          );
        }
      } else {
        transcriptData = {
          language: 'unknown',
          language_probability: 0,
          duration: metadata.duration,
          full_text: '',
          segments: [],
          word_count: 0
        };
      }

      // 5. Vision Tracking (Face, Hands, Body, Optical Flow & 9:16 Smooth Crop)
      const visionPath = path.join(projDir, 'vision', 'vision_data.json');
      let visionData: VisionData | null = null;

      if (fs.existsSync(visionPath)) {
        job.state = 'ANALYZING_VISION';
        job.progressPercent = 65;
        job.currentStep = 'Loading cached computer vision data...';
        this.log(job, 'Found cached vision tracking data.');
        visionData = JSON.parse(fs.readFileSync(visionPath, 'utf-8'));
      } else {
        job.state = 'ANALYZING_VISION';
        job.progressPercent = 55;
        job.currentStep = 'Tracking faces, hands, gestures, and movement dynamics (OpenCV + MediaPipe)...';
        this.log(job, 'Running multi-modal vision analysis and smooth crop calculation...');

        const vRes = await this.runPythonScript('pipeline/vision_tracker.py', [
          metadata.sourcePath,
          visionPath,
          '2.0'
        ]);

        if (vRes.error) {
          this.log(job, `Vision analysis warning: ${vRes.error}; continuing with heuristic framing.`);
        } else if (fs.existsSync(visionPath)) {
          visionData = JSON.parse(fs.readFileSync(visionPath, 'utf-8'));
          this.log(
            job,
            `Vision tracking complete: ${visionData?.frames.length} frames analyzed. Face visibility: ${Math.round(
              (visionData?.metrics.face_visibility_ratio || 0) * 100
            )}%`
          );
        }
      }

      // 6. AI Moment Discovery & Complete Thought Boundary Engine
      job.state = 'FINDING_CLIPS';
      job.progressPercent = 75;
      job.currentStep = 'Evaluating semantic relevance and complete thought boundaries...';
      this.log(job, `Analyzing moments for prompt: "${userPrompt || 'General High-Impact Moments'}"`);

      const profile =
        DEFAULT_CAMPAIGN_PROFILES.find((p) => p.id === campaignProfileId) || DEFAULT_CAMPAIGN_PROFILES[0];

      const candidates = await CandidateFinder.findCandidates(
        transcriptData,
        visionData,
        userPrompt,
        profile
      );

      this.log(job, `Identified ${candidates.length} distinct complete-thought candidates.`);

      // 7. Save candidates to disk
      const candidatesPath = path.join(projDir, 'candidates', 'candidates.json');
      fs.writeFileSync(candidatesPath, JSON.stringify(candidates, null, 2), 'utf-8');

      // 8. Pipeline complete and ready for user review/editing
      job.state = 'READY_FOR_REVIEW';
      job.progressPercent = 100;
      job.currentStep = 'Analysis complete. Candidates ready for review and editing.';
      job.completedAt = new Date().toISOString();
      this.log(job, 'All processing steps completed successfully.');
    } catch (err: any) {
      console.error('Pipeline error:', err);
      job.state = 'FAILED';
      job.error = err.message || 'Pipeline failed';
      this.log(job, `ERROR: ${err.message}`);
    }
  }

  /**
   * Renders a clip to 9:16 vertical MP4 using real FFmpeg
   */
  static startRenderJob(
    projectId: string,
    clipConfig: {
      clipId: string;
      startTime: number;
      endTime: number;
      crop?: { x: number; y: number; width: number; height: number };
      captionStyle: string;
      hookText?: string;
      burnCaptions: boolean;
      words: any[];
    }
  ): string {
    const jobId = `render_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const job: JobProgress = {
      id: jobId,
      projectId,
      type: 'RENDER_CLIP',
      state: 'QUEUED',
      progressPercent: 0,
      currentStep: 'Preparing render graph...',
      startedAt: now,
      updatedAt: now,
      logs: [`[${now}] Render job started for clip ${clipConfig.clipId}`]
    };

    this.jobs.set(jobId, job);

    setTimeout(() => {
      this.executeRender(jobId, projectId, clipConfig);
    }, 10);

    return jobId;
  }

  private static async executeRender(jobId: string, projectId: string, clipConfig: any) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const projDir = path.join(this.projectsDir, path.basename(projectId));
    const metaPath = path.join(projDir, 'metadata', 'project.json');
    if (!fs.existsSync(metaPath)) {
      job.state = 'FAILED';
      job.error = 'Project metadata not found';
      return;
    }

    const metadata: ProjectMetadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

    // RENDER SAFETY VERIFICATION
    if (!metadata.sourcePath || !fs.existsSync(metadata.sourcePath)) {
      job.state = 'FAILED';
      job.error = `Render safety error: Source video does not exist at "${metadata.sourcePath}"`;
      this.log(job, `SAFETY VIOLATION: ${job.error}`);
      return;
    }

    const startTime = Number(clipConfig.startTime);
    const endTime = Number(clipConfig.endTime);

    if (isNaN(startTime) || startTime < 0) {
      job.state = 'FAILED';
      job.error = `Render safety error: Invalid start timestamp (${clipConfig.startTime}). Must be >= 0.`;
      this.log(job, `SAFETY VIOLATION: ${job.error}`);
      return;
    }

    if (isNaN(endTime) || endTime <= startTime) {
      job.state = 'FAILED';
      job.error = `Render safety error: End timestamp (${clipConfig.endTime}) must be strictly greater than start (${startTime}).`;
      this.log(job, `SAFETY VIOLATION: ${job.error}`);
      return;
    }

    if (metadata.duration > 0 && endTime > metadata.duration + 1.0) {
      job.state = 'FAILED';
      job.error = `Render safety error: End timestamp (${endTime}s) exceeds source video duration (${metadata.duration}s).`;
      this.log(job, `SAFETY VIOLATION: ${job.error}`);
      return;
    }

    if (endTime - startTime < 0.5) {
      job.state = 'FAILED';
      job.error = 'Render safety error: Clip duration must be at least 0.5 seconds.';
      this.log(job, `SAFETY VIOLATION: ${job.error}`);
      return;
    }

    // Sanitize clip ID to prevent path traversal
    const safeClipId = String(clipConfig.clipId).replace(/[^a-zA-Z0-9_\-]/g, '_');
    const outputFilename = `clip_${safeClipId}_9x16.mp4`;
    const outputPath = path.join(projDir, 'renders', outputFilename);
    const exportPath = path.join(this.exportsDir, outputFilename);

    // Verify output path does not overwrite source
    if (path.resolve(outputPath) === path.resolve(metadata.sourcePath)) {
      job.state = 'FAILED';
      job.error = 'Render safety error: Output file cannot overwrite source video.';
      this.log(job, `SAFETY VIOLATION: ${job.error}`);
      return;
    }

    try {
      job.state = 'RENDERING';
      job.progressPercent = 25;
      job.currentStep = 'Encoding 9:16 vertical video with FFmpeg (H.264 / AAC)...';
      this.log(job, `Trimming [${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s] and applying ${clipConfig.captionStyle} captions.`);

      const renderCfg = {
        source_path: metadata.sourcePath,
        output_path: outputPath,
        start_time: startTime,
        end_time: endTime,
        crop: clipConfig.crop,
        target_width: 1080,
        target_height: 1920,
        caption_style: clipConfig.captionStyle,
        words: clipConfig.words || [],
        hook_text: clipConfig.hookText,
        burn_captions: clipConfig.burnCaptions !== false
      };

      const res = await this.runPythonScript('pipeline/ffmpeg_renderer.py', [JSON.stringify(renderCfg)]);

      if (res.error) {
        throw new Error(`FFmpeg rendering failed: ${res.error}`);
      }

      // Copy to public exports directory as well
      try {
        fs.copyFileSync(outputPath, exportPath);
      } catch (e) {
        // ignore
      }

      // Update candidate status in candidates.json if exists
      const candPath = path.join(projDir, 'candidates', 'candidates.json');
      if (fs.existsSync(candPath)) {
        try {
          const list: CandidateClip[] = JSON.parse(fs.readFileSync(candPath, 'utf-8'));
          const target = list.find((c) => c.id === clipConfig.clipId);
          if (target) {
            target.renderedFilename = outputFilename;
            target.renderStatus = 'DONE';
            fs.writeFileSync(candPath, JSON.stringify(list, null, 2), 'utf-8');
          }
        } catch (e) {
          // ignore
        }
      }

      job.state = 'COMPLETED';
      job.progressPercent = 100;
      job.currentStep = `Render completed: ${outputFilename} (${Math.round((res.size_bytes || 0) / 1024)} KB)`;
      job.completedAt = new Date().toISOString();
      this.log(job, `Successfully validated output container: ${res.width}x${res.height} @ ${res.duration}s`);
    } catch (err: any) {
      console.error('Render error:', err);
      job.state = 'FAILED';
      job.error = err.message || 'Render failed';
      this.log(job, `ERROR: ${err.message}`);
    }
  }

  private static runPythonScript(scriptPath: string, args: string[]): Promise<any> {
    return new Promise((resolve) => {
      const fullScript = path.resolve(process.cwd(), scriptPath);
      const proc = spawn('python3', [fullScript, ...args], {
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0 && !stdout.trim()) {
          resolve({ error: stderr.trim() || `Script exited with code ${code}` });
          return;
        }

        try {
          // Find last JSON block in stdout
          const lines = stdout.trim().split('\n');
          let jsonStr = '';
          for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].startsWith('{') || lines[i].startsWith('[')) {
              jsonStr = lines.slice(i).join('\n');
              break;
            }
          }
          if (jsonStr) {
            resolve(JSON.parse(jsonStr));
          } else {
            resolve(JSON.parse(stdout.trim()));
          }
        } catch (e) {
          resolve({ output: stdout.trim(), stderr: stderr.trim() });
        }
      });
    });
  }
}
