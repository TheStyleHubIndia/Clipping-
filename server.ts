import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { JobManager } from './src/server/jobManager';
import { SystemStatusService } from './src/server/systemStatus';
import { CandidateFinder } from './src/server/candidateFinder';
import { ComplianceEngine, DEFAULT_CAMPAIGN_PROFILES } from './src/server/complianceEngine';
import { CandidateClip, ProjectMetadata } from './src/server/types';

const app = express();
const PORT = process.env.PORT || 3000;

JobManager.init();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure upload storage for local video files
const uploadDir = path.resolve(process.cwd(), 'projects', 'uploads_temp');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 6)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 * 2 }, // 2GB limit
  fileFilter: (_req, file, cb) => {
    const allowed = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed formats: MP4, MOV, WebM, MKV.`));
    }
  }
});

// 1. System Status API
app.get('/api/status', async (_req, res) => {
  try {
    const services = await SystemStatusService.checkSystemStatus();
    res.json({ services });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Campaign Profiles API
app.get('/api/campaign-profiles', (_req, res) => {
  try {
    const profiles = JobManager.getCampaignProfiles();
    res.json({ profiles });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaign-profiles', (req, res) => {
  try {
    const result = JobManager.saveCampaignProfile(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, profile: result.profile });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/campaign-profiles/:id', (req, res) => {
  try {
    const ok = JobManager.deleteCampaignProfile(req.params.id);
    if (!ok) {
      return res.status(400).json({ error: 'Cannot delete default built-in profile or profile not found.' });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Project Creation from Upload
app.post('/api/projects/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const title = req.body.title || path.parse(req.file.originalname).name;
    const project = JobManager.createProject({
      title,
      sourceType: 'UPLOAD',
      sourceFilename: req.file.originalname
    });

    // Move uploaded file into project source folder
    const targetPath = path.join(process.cwd(), 'projects', project.id, 'source', req.file.originalname);
    fs.renameSync(req.file.path, targetPath);

    project.sourcePath = targetPath;
    fs.writeFileSync(
      path.join(process.cwd(), 'projects', project.id, 'metadata', 'project.json'),
      JSON.stringify(project, null, 2)
    );

    res.json({ success: true, project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Project Creation from URL (YouTube / Shorts)
app.post('/api/projects/url', async (req, res) => {
  try {
    const { url, title } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'A valid video URL is required' });
    }

    // Basic URL validation
    const trimmed = url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return res.status(400).json({ error: 'URL must start with http:// or https://' });
    }

    const project = JobManager.createProject({
      title: title || 'Web / YouTube Source',
      sourceType: 'YOUTUBE',
      sourceUrl: trimmed,
      sourceFilename: 'downloaded.mp4'
    });

    res.json({ success: true, project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Project Creation from Sample Video (Instant testing)
app.post('/api/projects/sample', async (_req, res) => {
  try {
    const project = JobManager.createProject({
      title: 'AI Clipping Studio Sample Video',
      sourceType: 'SAMPLE',
      sourceFilename: 'sample_video.mp4'
    });

    const targetPath = path.join(process.cwd(), 'projects', project.id, 'source', 'sample_video.mp4');
    
    // Generate sample video using pipeline script
    const { spawnSync } = await import('child_process');
    spawnSync('python3', [path.resolve(process.cwd(), 'pipeline', 'create_sample_video.py'), targetPath], {
      encoding: 'utf-8'
    });

    project.sourcePath = targetPath;
    fs.writeFileSync(
      path.join(process.cwd(), 'projects', project.id, 'metadata', 'project.json'),
      JSON.stringify(project, null, 2)
    );

    res.json({ success: true, project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. List Projects
app.get('/api/projects', (_req, res) => {
  try {
    const list = JobManager.listProjects();
    res.json({ projects: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Get Project Details
app.get('/api/projects/:id', (req, res) => {
  try {
    const project = JobManager.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Start Analysis Pipeline Job
app.post('/api/projects/:id/analyze', (req, res) => {
  try {
    const { userPrompt, campaignProfileId } = req.body;
    const jobId = JobManager.startPipelineJob(req.params.id, userPrompt, campaignProfileId);
    res.json({ success: true, jobId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Re-run Moment Discovery with new prompt
app.post('/api/projects/:id/candidates', async (req, res) => {
  try {
    const { userPrompt, campaignProfileId } = req.body;
    const project = JobManager.getProject(req.params.id);
    if (!project || !project.transcript) {
      return res.status(400).json({ error: 'Project must be analyzed before refining candidates' });
    }

    const profile = DEFAULT_CAMPAIGN_PROFILES.find((p) => p.id === campaignProfileId);
    const candidates = await CandidateFinder.findCandidates(
      project.transcript,
      project.vision || null,
      userPrompt || '',
      profile
    );

    // Save updated candidates
    const candPath = path.join(process.cwd(), 'projects', req.params.id, 'candidates', 'candidates.json');
    fs.writeFileSync(candPath, JSON.stringify(candidates, null, 2), 'utf-8');

    res.json({ success: true, candidates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Check Job Status
app.get('/api/jobs/:id', (req, res) => {
  const job = JobManager.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({ job });
});

// 11. Cancel Job
app.post('/api/jobs/:id/cancel', (req, res) => {
  const ok = JobManager.cancelJob(req.params.id);
  res.json({ success: ok });
});

// 12. Render Clip with Strict Safety Checks
app.post('/api/projects/:id/render', (req, res) => {
  try {
    const { clipConfig } = req.body;
    if (!clipConfig || !clipConfig.clipId) {
      return res.status(400).json({ error: 'Invalid clip render parameters: clipId is required.' });
    }

    const project = JobManager.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: `Project not found: ${req.params.id}` });
    }

    const startTime = Number(clipConfig.startTime);
    const endTime = Number(clipConfig.endTime);

    if (isNaN(startTime) || startTime < 0) {
      return res.status(400).json({ error: `Invalid start timestamp: ${clipConfig.startTime}. Must be >= 0.` });
    }

    if (isNaN(endTime) || endTime <= startTime) {
      return res.status(400).json({ error: `Invalid end timestamp: ${clipConfig.endTime}. Must be strictly greater than start (${startTime}).` });
    }

    if (project.metadata.duration > 0 && endTime > project.metadata.duration + 1.0) {
      return res.status(400).json({
        error: `End timestamp (${endTime}s) exceeds source video duration (${project.metadata.duration}s).`
      });
    }

    if (!fs.existsSync(project.metadata.sourcePath)) {
      return res.status(400).json({ error: `Source video missing on disk: ${project.metadata.sourcePath}` });
    }

    const jobId = JobManager.startRenderJob(req.params.id, clipConfig);
    res.json({ success: true, jobId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Stream Source Video with Range Support
app.get('/api/projects/:id/source', (req, res) => {
  const project = JobManager.getProject(req.params.id);
  if (!project || !fs.existsSync(project.metadata.sourcePath)) {
    return res.status(404).json({ error: 'Video source file not found' });
  }

  const filePath = project.metadata.sourcePath;
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4'
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// 14. Stream Rendered Vertical Clip
app.get('/api/projects/:id/renders/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(process.cwd(), 'projects', req.params.id, 'renders', safeFilename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Rendered clip not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4'
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// 15. Compliance Evaluation API
app.post('/api/compliance/check', (req, res) => {
  try {
    const { transcript, hook, profileId, customProfile } = req.body;
    let profile = customProfile;
    if (!profile && profileId) {
      profile = JobManager.getCampaignProfiles().find((p) => p.id === profileId);
    }
    const result = ComplianceEngine.evaluateClip(transcript || '', hook || '', profile);
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mount Vite or serve static files
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`[AI Clipping Studio] Server running on port ${PORT}`);
  });
}

startServer();
