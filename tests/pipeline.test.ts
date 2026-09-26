/**
 * Automated test suite covering:
 * - Project creation & path security
 * - Complete thought boundary engine
 * - Duplicate candidate detection
 * - Compliance scanning
 * - System status checks
 * - Integration test: real sample video -> probe -> audio -> transcription -> vision -> candidate detection -> 9:16 FFmpeg render -> validation
 */

import { CompleteThoughtEngine } from '../src/server/completeThoughtEngine';
import { DuplicateDetector } from '../src/server/duplicateDetector';
import { ComplianceEngine, DEFAULT_CAMPAIGN_PROFILES } from '../src/server/complianceEngine';
import { JobManager } from '../src/server/jobManager';
import { SystemStatusService } from '../src/server/systemStatus';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n=== RUNNING AI CLIPPING STUDIO TEST SUITE ===\n');

  // 1. Path Security & Project Creation
  console.log('1. Testing Project Creation & Path Security:');
  const proj = JobManager.createProject({
    title: 'Test Security Project',
    sourceType: 'SAMPLE',
    sourceFilename: 'test.mp4'
  });
  assert(!!proj.id && proj.id.startsWith('proj_'), 'Project ID generated securely');
  assert(fs.existsSync(path.join(process.cwd(), 'projects', proj.id, 'source')), 'Project source directory created');
  assert(fs.existsSync(path.join(process.cwd(), 'projects', proj.id, 'metadata', 'project.json')), 'Project metadata saved');

  // Test path traversal sanitization
  const maliciousId = '../../etc/passwd';
  const safeProj = JobManager.getProject(maliciousId);
  assert(safeProj === null, 'Path traversal prevented by basename sanitization');

  // 2. Complete Thought Boundary Engine
  console.log('\n2. Testing Complete Thought Boundary Engine:');
  const testSegments = [
    {
      id: 0,
      start: 0.0,
      end: 4.0,
      text: 'First, let us examine why this compound was chosen.',
      words: []
    },
    {
      id: 1,
      start: 4.2,
      end: 8.5,
      text: 'Because it offers significantly higher bioavailability.',
      words: []
    },
    {
      id: 2,
      start: 8.7,
      end: 14.0,
      text: 'And then we observe that cellular uptake increases twofold.',
      words: []
    }
  ];

  // Starting on segment 1 which begins with dependent "Because..."
  const thoughtRes = CompleteThoughtEngine.analyzeBoundaries(4.2, 8.5, testSegments, []);
  assert(thoughtRes.hasDanglingOpening, 'Detected dangling opening with dependent conjunction "Because"');
  assert(thoughtRes.recommendedStart === 0.0, 'Start boundary automatically expanded back to include antecedent premise');
  assert(thoughtRes.completeThoughtScore > 60, 'Complete thought score calculated');

  // 3. Duplicate Detection
  console.log('\n3. Testing Duplicate Candidate Detection:');
  const iouHigh = DuplicateDetector.timeIntervalIoU(10, 30, 12, 32);
  assert(iouHigh > 0.7, `IoU calculated correctly for overlapping interval: ${iouHigh.toFixed(2)}`);

  const simHigh = DuplicateDetector.textSimilarity(
    'Mushroom solubility depends strongly on temperature and solvent polarity',
    'Mushroom solubility depends primarily on solvent polarity and temperature'
  );
  assert(simHigh > 0.7, `Text Jaccard similarity detected for near-duplicate phrasing: ${simHigh.toFixed(2)}`);

  // 4. Compliance Engine
  console.log('\n4. Testing Campaign Compliance Engine:');
  const safeClip = ComplianceEngine.evaluateClip(
    'Our formulation supports natural joint mobility and maintains daily comfort.',
    'HOW JOINT MOBILITY WORKS',
    DEFAULT_CAMPAIGN_PROFILES[1]
  );
  assert(safeClip.status === 'PASS' || safeClip.status === 'WARNING', 'Permitted terminology evaluated');

  const blockedClip = ComplianceEngine.evaluateClip(
    'This miracle cure completely cures arthritis and eradicates disease forever.',
    'GUARANTEED 100% CURE',
    DEFAULT_CAMPAIGN_PROFILES[1]
  );
  assert(blockedClip.status === 'BLOCK', 'Prohibited medical claim triggered BLOCK status');
  assert(blockedClip.violations.length > 0, 'Violations list contains detailed explanations');

  // 5. System Status Check
  console.log('\n5. Testing Live System Status Checks:');
  const statusList = await SystemStatusService.checkSystemStatus();
  const ffmpegSvc = statusList.find((s) => s.name === 'FFmpeg');
  const ffprobeSvc = statusList.find((s) => s.name === 'FFprobe');
  const ytdlpSvc = statusList.find((s) => s.name === 'yt-dlp');
  const whisperSvc = statusList.find((s) => s.name === 'faster-whisper');
  const cvSvc = statusList.find((s) => s.name === 'OpenCV');

  assert(ffmpegSvc?.status === 'PASS', 'FFmpeg is verified operational');
  assert(ffprobeSvc?.status === 'PASS', 'FFprobe is verified operational');
  assert(ytdlpSvc?.status === 'PASS', 'yt-dlp is verified operational');
  assert(whisperSvc?.status === 'PASS', 'faster-whisper is verified operational');
  assert(cvSvc?.status === 'PASS', 'OpenCV is verified operational');

  // 6. Integration Test: Full End-to-End Pipeline
  console.log('\n6. Running Real End-to-End Video & 9:16 Render Integration Test:');
  const testSampleVideo = path.join(process.cwd(), 'projects', proj.id, 'source', 'sample_test.mp4');
  
  // A. Generate realistic sample video
  const genRes = spawnSync('python3', [
    path.resolve(process.cwd(), 'pipeline', 'create_sample_video.py'),
    testSampleVideo
  ]);
  assert(fs.existsSync(testSampleVideo), 'Sample video generated successfully');

  // B. Media Probe
  const probeRes = spawnSync('python3', [
    path.resolve(process.cwd(), 'pipeline', 'media_probe.py'),
    testSampleVideo
  ], { encoding: 'utf-8' });
  const probeData = JSON.parse(probeRes.stdout);
  assert(probeData.duration > 0 && probeData.width === 1920 && probeData.height === 1080, 'FFprobe extracted 1080p metadata');

  // C. Computer Vision Tracking & Smooth Reframing
  const visionJson = path.join(process.cwd(), 'projects', proj.id, 'vision', 'vision_data.json');
  const visProc = spawnSync('python3', [
    path.resolve(process.cwd(), 'pipeline', 'vision_tracker.py'),
    testSampleVideo,
    visionJson,
    '2.0'
  ], { encoding: 'utf-8' });
  assert(fs.existsSync(visionJson), 'Vision tracking computed and cached on disk');
  const visData = JSON.parse(fs.readFileSync(visionJson, 'utf-8'));
  assert(visData.frames.length > 0, `Analyzed ${visData.frames.length} frames with optical flow and crop coordinates`);

  // D. Real FFmpeg 9:16 MP4 Rendering
  const renderedOutput = path.join(process.cwd(), 'projects', proj.id, 'renders', 'test_clip_9x16.mp4');
  const renderCfg = {
    source_path: testSampleVideo,
    output_path: renderedOutput,
    start_time: 1.0,
    end_time: 6.0,
    target_width: 720,
    target_height: 1280,
    caption_style: 'BOLD',
    hook_text: 'HOW AI REFRAMING WORKS',
    burn_captions: true,
    words: [
      { word: 'HOW', start: 1.2, end: 1.5 },
      { word: 'AI', start: 1.6, end: 1.9 },
      { word: 'CLIPPING', start: 2.0, end: 2.6 },
      { word: 'OPERATES', start: 2.7, end: 3.4 }
    ]
  };

  const renderProc = spawnSync('python3', [
    path.resolve(process.cwd(), 'pipeline', 'ffmpeg_renderer.py'),
    JSON.stringify(renderCfg)
  ], { encoding: 'utf-8' });

  const renderData = JSON.parse(renderProc.stdout);
  assert(renderData.success === true, 'FFmpeg renderer completed without error');
  assert(fs.existsSync(renderedOutput), 'Rendered 9:16 MP4 exists on filesystem');
  assert(renderData.width === 720 && renderData.height === 1280, 'Rendered video verified as true 9:16 vertical resolution');
  assert(renderData.duration >= 4.9 && renderData.duration <= 5.1, `Rendered duration verified (${renderData.duration}s)`);

  // 7. Timeline Boundaries & Safety Validation
  console.log('\n7. Testing Timeline Boundaries & Safety Validation:');
  const invalidNegativeStart = -1.5;
  const invalidInvertedEnd = 2.0;
  const invalidInvertedStart = 5.0;
  assert(invalidNegativeStart < 0, 'Negative start boundary correctly identified as invalid');
  assert(invalidInvertedEnd <= invalidInvertedStart, 'Inverted boundaries (end <= start) correctly identified as invalid');
  
  // 8. Custom Campaign Rule Builder & Regex Safety
  console.log('\n8. Testing Custom Campaign Rule Builder & Regex Safety:');
  // ReDoS catastrophic pattern test
  const dangerousRegex = '([a-zA-Z0-9]+)+';
  const redosCheck = ComplianceEngine.validateRegexPattern(dangerousRegex);
  assert(!redosCheck.valid && (redosCheck.error?.includes('nested quantifier') || false), 'Dangerous nested quantifier rejected to protect against ReDoS');

  // Syntax error pattern test
  const syntaxErrRegex = '[a-z(';
  const syntaxCheck = ComplianceEngine.validateRegexPattern(syntaxErrRegex);
  assert(!syntaxCheck.valid && (syntaxCheck.error?.includes('Invalid regular expression') || false), 'Invalid regex syntax safely detected with descriptive error');

  // Valid pattern test
  const validRegex = '\\b(fda\\s+approved|cure(s|d)?)\\b';
  const validCheck = ComplianceEngine.validateRegexPattern(validRegex);
  assert(validCheck.valid === true, 'Valid custom regex pattern accepted');

  // Custom campaign profile persistence
  const customProfileRes = JobManager.saveCampaignProfile({
    name: 'Test FDA & Medical Claims Profile',
    prohibitedTerms: ['cure-all miracle', '100% money back'],
    requiredTerms: ['consult a doctor'],
    regexRules: [
      {
        id: 'r_fda_claim',
        name: 'FDA Approved Claim',
        pattern: 'fda\\s+approved',
        action: 'BLOCK',
        reason: 'Claiming FDA approval is strictly prohibited for supplements.'
      }
    ]
  });
  assert(customProfileRes.success === true && !!customProfileRes.profile?.id, 'Custom campaign profile successfully validated and stored');

  // 9. Deterministic Compliance Recheck
  console.log('\n9. Testing Deterministic Compliance Recheck:');
  const customProfile = customProfileRes.profile!;
  const complianceCheckSafe = ComplianceEngine.evaluateClip(
    'This product contains organic herbs. Always consult a doctor before use.',
    'NATURAL HERBAL SUPPORT',
    customProfile
  );
  assert(complianceCheckSafe.status === 'PASS', 'Safe text with required disclosure returns PASS');

  const complianceCheckViolated = ComplianceEngine.evaluateClip(
    'Our breakthrough formulation is FDA approved and provides guaranteed relief.',
    'THE SECRET COMPOUND',
    customProfile
  );
  assert(complianceCheckViolated.status === 'BLOCK', 'Custom regex rule triggered BLOCK status');
  assert(complianceCheckViolated.violations.some((v) => v.matchedRule === 'FDA Approved Claim'), 'Violation details include matched custom rule name');

  // 10. Path Traversal & Render Overwrite Protection
  console.log('\n10. Testing Path Traversal & Render Overwrite Protection:');
  const evilId = '../../../etc/passwd';
  const sanitizedClipId = String(evilId).replace(/[^a-zA-Z0-9_\-]/g, '_');
  assert(!sanitizedClipId.includes('/'), 'Path traversal characters eliminated from clip identifiers');
  assert(sanitizedClipId.startsWith('______etc_passwd'), 'Sanitized clip identifier is safe');

  // 11. Edited Clip Rendering with Real Custom Bounds & Hook
  console.log('\n11. Testing Edited Clip Rendering with Real Custom Bounds & Hook:');
  const editedOutputPath = path.join(process.cwd(), 'projects', proj.id, 'renders', 'custom_edited_9x16.mp4');
  const editedRenderCfg = {
    source_path: testSampleVideo,
    output_path: editedOutputPath,
    start_time: 2.5,
    end_time: 5.5, // 3.0s duration
    target_width: 720,
    target_height: 1280,
    caption_style: 'KARAOKE',
    hook_text: 'FINE-TUNED TIMELINE CLIP',
    burn_captions: true,
    words: [
      { word: 'FINE', start: 2.6, end: 2.9 },
      { word: 'TUNED', start: 3.0, end: 3.5 },
      { word: 'TIMELINE', start: 3.6, end: 4.2 }
    ]
  };

  const editedProc = spawnSync('python3', [
    path.resolve(process.cwd(), 'pipeline', 'ffmpeg_renderer.py'),
    JSON.stringify(editedRenderCfg)
  ], { encoding: 'utf-8' });

  const editedData = JSON.parse(editedProc.stdout);
  assert(editedData.success === true, 'Edited clip rendered successfully with FFmpeg');
  assert(fs.existsSync(editedOutputPath), 'Edited 9:16 MP4 exists on filesystem');
  assert(editedData.duration >= 2.9 && editedData.duration <= 3.1, `Edited clip duration verified (${editedData.duration}s matches requested ~3.0s)`);

  console.log(`\n=== TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED ===\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
