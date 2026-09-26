import { execSync } from 'child_process';
import { SystemServiceStatus } from './types';

export class SystemStatusService {
  /**
   * Checks real operational status of all pipeline dependencies.
   */
  static async checkSystemStatus(): Promise<SystemServiceStatus[]> {
    const results: SystemServiceStatus[] = [];

    // 1. FFmpeg check
    try {
      const out = execSync('ffmpeg -version', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      const versionLine = out.split('\n')[0] || '';
      results.push({
        name: 'FFmpeg',
        status: 'PASS',
        version: versionLine.slice(0, 40),
        description: 'Core video slicing, audio encoding, filter graphs, and subtitle burning engine.'
      });
    } catch (e: any) {
      results.push({
        name: 'FFmpeg',
        status: 'NOT_INSTALLED',
        description: 'FFmpeg binary missing from system PATH.',
        details: e.message
      });
    }

    // 2. FFprobe check
    try {
      const out = execSync('ffprobe -version', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      const versionLine = out.split('\n')[0] || '';
      results.push({
        name: 'FFprobe',
        status: 'PASS',
        version: versionLine.slice(0, 40),
        description: 'Audio/video container validation and stream inspection.'
      });
    } catch (e: any) {
      results.push({
        name: 'FFprobe',
        status: 'NOT_INSTALLED',
        description: 'FFprobe binary missing from system PATH.',
        details: e.message
      });
    }

    // 3. yt-dlp check
    try {
      const out = execSync('yt-dlp --version', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      results.push({
        name: 'yt-dlp',
        status: 'PASS',
        version: out.trim(),
        description: 'YouTube, YouTube Shorts, and web media downloader.'
      });
    } catch (e: any) {
      results.push({
        name: 'yt-dlp',
        status: 'NOT_INSTALLED',
        description: 'yt-dlp binary missing.',
        details: e.message
      });
    }

    // 4. faster-whisper check
    try {
      const out = execSync('python3 -c "import faster_whisper; print(faster_whisper.__version__)"', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      results.push({
        name: 'faster-whisper',
        status: 'PASS',
        version: `v${out.trim()}`,
        description: 'High-speed local neural speech-to-text with word-level timestamps.'
      });
    } catch (e: any) {
      results.push({
        name: 'faster-whisper',
        status: 'WARNING',
        description: 'faster-whisper python package not found; speech transcription fallback active.',
        details: e.message
      });
    }

    // 5. OpenCV check
    try {
      const out = execSync('python3 -c "import cv2; print(cv2.__version__)"', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      results.push({
        name: 'OpenCV',
        status: 'PASS',
        version: `v${out.trim()}`,
        description: 'Facial detection, optical flow movement analysis, and visual interest scoring.'
      });
    } catch (e: any) {
      results.push({
        name: 'OpenCV',
        status: 'NOT_INSTALLED',
        description: 'OpenCV python library missing.',
        details: e.message
      });
    }

    // 6. MediaPipe check
    try {
      const out = execSync('python3 -c "import mediapipe; print(mediapipe.__version__)"', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      results.push({
        name: 'MediaPipe',
        status: 'PASS',
        version: `v${out.trim()}`,
        description: 'Hand landmarks, gesture tracking, and body pose composition.'
      });
    } catch (e: any) {
      results.push({
        name: 'MediaPipe',
        status: 'WARNING',
        description: 'MediaPipe optional package not active; falling back to OpenCV facial tracking.',
        details: e.message
      });
    }

    // 7. Gemini AI Provider check
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey !== 'MY_GEMINI_API_KEY' && geminiKey.length > 8) {
      results.push({
        name: 'Gemini AI Provider',
        status: 'PASS',
        version: 'gemini-2.5-flash',
        description: 'Server-side semantic moment discovery and rhetorical analysis.'
      });
    } else {
      results.push({
        name: 'Gemini AI Provider',
        status: 'WARNING',
        description: 'No API key supplied; local heuristic & transcript windowing engine active.'
      });
    }

    return results;
  }
}
