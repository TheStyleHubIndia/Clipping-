import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { spawn } from 'child_process';
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

const uploadDir = path.resolve(process.cwd(), 'projects', 'uploads_temp');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `upload_${Date.now()}_${Math.random().toString(36).substring(2, 6)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 * 2 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext}`));
  }
});

app.get('/api/status', async (_req, res) => {
  try { res.json({ services: await SystemStatusService.checkSystemStatus() }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});
app.get('/api/campaign-profiles', (_req, res) => {
  try { res.json({ profiles: JobManager.getCampaignProfiles() }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});
app.post('/api/campaign-profiles', (req, res) => {
  try {
    const result = JobManager.saveCampaignProfile(req.body);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, profile: result.profile });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/campaign-profiles/:id', (req, res) => {
  try {
    const ok = JobManager.deleteCampaignProfile(req.params.id);
    if (!ok) return res.status(400).json({ error: 'Cannot delete default built-in profile or profile not found.' });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/projects/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No video file provided' });
    const project = JobManager.createProject({ title: req.body.title || path.parse(req.file.originalname).name, sourceType: 'UPLOAD', sourceFilename: req.file.originalname });
    const targetPath = path.join(process.cwd(), 'projects', project.id, 'source', req.file.originalname);
    fs.renameSync(req.file.path, targetPath);
    project.sourcePath = targetPath;
    fs.writeFileSync(path.join(process.cwd(), 'projects', project.id, 'metadata', 'project.json'), JSON.stringify(project, null, 2));
    res.json({ success: true, project });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/projects/url', async (req, res) => {
  try {
    const { url, title } = req.body;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'A valid video URL is required' });
    const trimmed = url.trim();
    if (!/^https?:\/\//.test(trimmed)) return res.status(400).json({ error: 'URL must start with http:// or https://' });
    const project = JobManager.createProject({ title: title || 'Web / YouTube Source', sourceType: 'YOUTUBE', sourceUrl: trimmed, sourceFilename: 'downloaded.mp4' });
    res.json({ success: true, project });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/projects/sample', async (_req, res) => {
  try {
    const project = JobManager.createProject({ title: 'AI Clipping Studio Sample Video', sourceType: 'SAMPLE', sourceFilename: 'sample_video.mp4' });
    const targetPath = path.join(process.cwd(), 'projects', project.id, 'source', 'sample_video.mp4');
    const { spawnSync } = await import('child_process');
    spawnSync('python3', [path.resolve(process.cwd(), 'pipeline', 'create_sample_video.py'), targetPath], { encoding: 'utf-8' });
    project.sourcePath = targetPath;
    fs.writeFileSync(path.join(process.cwd(), 'projects', project.id, 'metadata', 'project.json'), JSON.stringify(project, null, 2));
    res.json({ success: true, project });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/projects', (_req, res) => {
  try { res.json({ projects: JobManager.listProjects() }); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
app.get('/api/projects/:id', (req, res) => {
  try {
    const project = JobManager.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
app.post('/api/projects/:id/analyze', (req, res) => {
  try {
    res.json({ success: true, jobId: JobManager.startPipelineJob(req.params.id, req.body.userPrompt, req.body.campaignProfileId) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
app.post('/api/projects/:id/candidates', async (req, res) => {
  try {
    const project = JobManager.getProject(req.params.id);
    if (!project || !project.transcript) return res.status(400).json({ error: 'Project must be analyzed before refining candidates' });
    const profile = DEFAULT_CAMPAIGN_PROFILES.find((p) => p.id === req.body.campaignProfileId);
    const candidates = await CandidateFinder.findCandidates(project.transcript, project.vision || null, req.body.userPrompt || '', profile);
    fs.writeFileSync(path.join(process.cwd(), 'projects', req.params.id, 'candidates', 'candidates.json'), JSON.stringify(candidates, null, 2));
    res.json({ success: true, candidates });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
app.get('/api/jobs/:id', (req, res) => {
  const job = JobManager.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job });
});
app.post('/api/jobs/:id/cancel', (req, res) => res.json({ success: JobManager.cancelJob(req.params.id) }));

app.post('/api/projects/:id/render', (req, res) => {
  try {
    const { clipConfig } = req.body;
    const project = JobManager.getProject(req.params.id);
    if (!clipConfig?.clipId) return res.status(400).json({ error: 'Invalid clip render parameters: clipId is required.' });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const startTime = Number(clipConfig.startTime), endTime = Number(clipConfig.endTime);
    if (!Number.isFinite(startTime) || startTime < 0 || !Number.isFinite(endTime) || endTime <= startTime) return res.status(400).json({ error: 'Invalid render timestamps.' });
    if (project.metadata.duration > 0 && endTime > project.metadata.duration + 1) return res.status(400).json({ error: 'End timestamp exceeds source duration.' });
    if (!fs.existsSync(project.metadata.sourcePath)) return res.status(400).json({ error: 'Source video missing on disk.' });
    res.json({ success: true, jobId: JobManager.startRenderJob(req.params.id, clipConfig) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/rankstudio/render', upload.array('clips', 30), async (req, res) => {
  const files = (req.files || []) as Express.Multer.File[];
  try {
    if (!files.length) return res.status(400).json({ error: 'Add at least one video clip.' });
    const ranks = JSON.parse(String(req.body.ranks || '[]'));
    if (!Array.isArray(ranks) || ranks.length !== files.length) return res.status(400).json({ error: 'Rank metadata must match clip count.' });

    const outDir = path.resolve(process.cwd(), 'exports');
    fs.mkdirSync(outDir, { recursive: true });
    const filename = `rankstudio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
    const output = path.join(outDir, filename);
    const args: string[] = ['-y'];
    files.forEach(f => args.push('-i', f.path));

    const filters: string[] = [];
    files.forEach((_, i) => {
      filters.push(
        `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p[v${i}]`,
        `[${i}:a]aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo[a${i}]`
      );
    });
    const concatInputs = files.map((_, i) => `[v${i}][a${i}]`).join('');
    filters.push(`${concatInputs}concat=n=${files.length}:v=1:a=1[v][a]`);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', [...args, '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-metadata', `title=${String(req.body.title || 'Rank Studio').slice(0,120)}`, output], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); if (stderr.length > 12000) stderr = stderr.slice(-12000); });
      proc.on('error', reject);
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || `FFmpeg exited with code ${code}`)));
    });

    const stat = fs.statSync(output);
    res.json({ success: true, filename, url: `/exports/${filename}`, bytes: stat.size, width: 1080, height: 1920, fps: 30, container: 'MP4', videoCodec: 'H.264', audioCodec: 'AAC', ranks });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Rank Studio render failed' });
  } finally {
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
  }
});

app.get('/api/projects/:id/source', (req, res) => {
  const project = JobManager.getProject(req.params.id);
  if (!project || !fs.existsSync(project.metadata.sourcePath)) return res.status(404).json({ error: 'Video source file not found' });
  const filePath = project.metadata.sourcePath, stat = fs.statSync(filePath), fileSize = stat.size, range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-'), start = parseInt(parts[0],10), end = parts[1] ? parseInt(parts[1],10) : fileSize-1;
    const file = fs.createReadStream(filePath,{start,end});
    res.writeHead(206, {'Content-Range':`bytes ${start}-${end}/${fileSize}`,'Accept-Ranges':'bytes','Content-Length':end-start+1,'Content-Type':'video/mp4'}); file.pipe(res);
  } else { res.writeHead(200, {'Content-Length':fileSize,'Content-Type':'video/mp4'}); fs.createReadStream(filePath).pipe(res); }
});
app.get('/api/projects/:id/renders/:filename', (req,res) => {
  const safeFilename = path.basename(req.params.filename), filePath = path.join(process.cwd(),'projects',req.params.id,'renders',safeFilename);
  if (!fs.existsSync(filePath)) return res.status(404).json({error:'Rendered clip not found'});
  res.sendFile(filePath);
});
app.post('/api/compliance/check', (req,res) => {
  try {
    const {transcript,hook,profileId,customProfile}=req.body;
    const profile=customProfile || (profileId ? JobManager.getCampaignProfiles().find(p=>p.id===profileId) : undefined);
    res.json({result:ComplianceEngine.evaluateClip(transcript||'',hook||'',profile)});
  } catch(err:any){res.status(500).json({error:err.message});}
});

app.use('/exports', express.static(path.resolve(process.cwd(), 'exports')));

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server:{middlewareMode:true}, appType:'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(),'dist')));
    app.get('*', (_req,res)=>res.sendFile(path.resolve(process.cwd(),'dist','index.html')));
  }
  app.listen(PORT,()=>console.log(`[AI Clipping Studio] Server running on port ${PORT}`));
}
startServer();
