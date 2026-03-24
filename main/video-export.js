/**
 * Video export module – maakt video van een map met genummerde PNG-frames via ffmpeg.
 * Ondersteunt meerdere formaten/codecs (ProRes, FFV1, HEVC, H.264).
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { nativeImage } = require('electron');

/** Format-presets: id, extensie, ffmpeg codec-args (na -i input). */
const VIDEO_FORMATS = {
  'prores4444': { ext: 'mov', args: ['-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le'] },
  'prores422': { ext: 'mov', args: ['-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le'] },
  'ffv1': { ext: 'mkv', args: ['-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'yuv420p'] },
  'hevc': { ext: 'mp4', args: ['-c:v', 'libx265', '-tag:v', 'hvc1', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'] },
  'h264': { ext: 'mp4', args: ['-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'] }
};

let ffmpegPath = null;

function getFfmpegPath() {
  if (ffmpegPath !== null) return ffmpegPath;
  try {
    let binaryPath = require('ffmpeg-static');
    if (binaryPath && typeof binaryPath === 'string') {
      if (process.versions?.electron && binaryPath.includes('app.asar')) {
        binaryPath = binaryPath.replace('app.asar', 'app.asar.unpacked');
      }
      if (fs.existsSync(binaryPath)) {
        ffmpegPath = binaryPath;
        return ffmpegPath;
      }
    }
  } catch (_) {
    // ffmpeg-static niet geïnstalleerd
  }
  ffmpegPath = 'ffmpeg';
  return ffmpegPath;
}

/**
 * Maak video van frames in folder.
 * @param {Object} opts
 * @param {string} opts.framesFolder - Map met frame_000001.png, frame_000002.png, …
 * @param {string} opts.outputPath - Pad naar uitvoerbestand
 * @param {number} opts.fps - Framerate
 * @param {string} [opts.formatId='h264'] - Id uit VIDEO_FORMATS
 * @param {function} [opts.onProgress] - (phase, detail) => void
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function createVideo(opts) {
  return new Promise((resolve) => {
    const { framesFolder, outputPath, fps = 24, formatId = 'h264', onProgress } = opts || {};
    if (!framesFolder || !outputPath) {
      resolve({ ok: false, error: 'Ontbrekende parameters' });
      return;
    }
    const preset = VIDEO_FORMATS[formatId] || VIDEO_FORMATS.h264;
    if (typeof onProgress === 'function') onProgress('start', null);
    const bin = getFfmpegPath();
    const inputFile = path.join(framesFolder, 'frame_%06d.png');
    const args = [
      '-y',
      '-framerate', String(Math.max(1, Math.min(60, fps || 24))),
      '-i', inputFile,
      ...preset.args,
      outputPath
    ];
    const proc = spawn(bin, args, {
      cwd: path.dirname(inputFile),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    proc.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
      if (typeof onProgress === 'function') onProgress('encoding', stderr.slice(-200));
    });
    proc.on('close', (code) => {
      if (code === 0) {
        if (typeof onProgress === 'function') onProgress('done', null);
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: `ffmpeg afgebroken (code ${code}). Zorg dat ffmpeg in PATH staat of installeer ffmpeg-static.` });
      }
    });
    proc.on('error', (err) => {
      resolve({
        ok: false,
        error: err.code === 'ENOENT'
          ? 'ffmpeg niet gevonden. Installeer ffmpeg of voeg ffmpeg-static toe aan het project.'
          : (err.message || 'ffmpeg starten mislukt')
      });
    });
  });
}

/**
 * Ruim tijdelijke map op (optioneel na succesvolle export).
 */
function removeTempFolder(folderPath) {
  try {
    if (folderPath && fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true });
    }
  } catch (_) {}
}

/**
 * Controleer of ffmpeg beschikbaar is.
 */
async function checkFfmpegAvailable() {
  const bin = getFfmpegPath();
  if (bin === 'ffmpeg') {
    return new Promise((resolve) => {
      const proc = spawn(bin, ['-version'], { stdio: 'ignore' });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }
  return fs.existsSync(bin);
}

/**
 * Maak MP4 van een lijst beeldbestanden (willekeurige namen/extensies).
 * Kopieert frames naar temp map als frame_000001.png en roept createVideo aan.
 */
async function createVideoFromImagePaths(opts) {
  const { imagePaths, outputPath, fps = 24, formatId = 'h264', onProgress } = opts || {};
  if (!Array.isArray(imagePaths) || !imagePaths.length || !outputPath) {
    return { ok: false, error: 'Ontbrekende parameters' };
  }
  const tempFolder = path.join(os.tmpdir(), `film2frame-video-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tempFolder, { recursive: true });
  try {
    if (typeof onProgress === 'function') onProgress('copy', null);
    for (let i = 0; i < imagePaths.length; i++) {
      const src = imagePaths[i];
      const idx = i + 1;
      const dest = path.join(tempFolder, `frame_${String(idx).padStart(6, '0')}.png`);
      const ext = path.extname(src).toLowerCase();
      if (ext === '.png') {
        fs.copyFileSync(src, dest);
      } else {
        const img = nativeImage.createFromPath(src);
        if (img.isEmpty()) continue;
        fs.writeFileSync(dest, img.toPNG());
      }
    }
    const result = await createVideo({
      framesFolder: tempFolder,
      outputPath,
      fps,
      formatId,
      onProgress
    });
    return result;
  } finally {
    removeTempFolder(tempFolder);
  }
}

function getVideoFormats() {
  return VIDEO_FORMATS;
}

module.exports = {
  createVideo,
  createVideoFromImagePaths,
  removeTempFolder,
  checkFfmpegAvailable,
  getFfmpegPath,
  getVideoFormats
};
