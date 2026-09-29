import { spawnSync } from 'node:child_process';

function check(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    console.error(`[FFmpeg check] ${binary} is unavailable.`);
    if (result.error) console.error(result.error.message);
    process.exitCode = 1;
    return false;
  }
  const version = (result.stdout || result.stderr || '').split('\n')[0].trim();
  console.log(`[FFmpeg check] ${binary}: ${version || 'OK'}`);
  return true;
}

const ffmpegOk = check('ffmpeg', ['-version']);
const ffprobeOk = check('ffprobe', ['-version']);

if (!ffmpegOk || !ffprobeOk) {
  console.error('FFmpeg and ffprobe are required for video analysis and Rank Studio rendering.');
  process.exit(1);
}

const encoders = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
if (!encoders.stdout.includes('libx264')) {
  console.error('[FFmpeg check] libx264 encoder is missing.');
  process.exit(1);
}

console.log('[FFmpeg check] libx264 encoder: OK');
console.log('[FFmpeg check] All required video dependencies are available.');
