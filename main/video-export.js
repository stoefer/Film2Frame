/**
 * Video export module – maakt video van een map met genummerde PNG-frames via ffmpeg.
 * Ondersteunt meerdere formaten/codecs (ProRes, FFV1, HEVC, H.264).
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { nativeImage } = require('electron');
const { tr } = require('./main-i18n');

/** Format-presets: id, extensie, ffmpeg codec-args (na -i input). */
const VIDEO_FORMATS = {
  'prores4444': { ext: 'mov', args: ['-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le'] },
  'prores422': { ext: 'mov', args: ['-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le'] },
  'ffv1': { ext: 'mkv', args: ['-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'yuv420p'] },
  'hevc': { ext: 'mp4', args: ['-c:v', 'libx265', '-tag:v', 'hvc1', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'] },
  'h264': { ext: 'mp4', args: ['-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'] }
};

let ffmpegPath = null;

/** Gebruiker wil lopende map-kopie/ffmpeg stoppen. */
let videoExportCancelRequested = false;
let activeFfmpegProcess = null;

function beginVideoExportJob() {
  videoExportCancelRequested = false;
}

function cancelVideoExport() {
  videoExportCancelRequested = true;
  if (activeFfmpegProcess) {
    try {
      activeFfmpegProcess.kill('SIGTERM');
    } catch (_) {}
    activeFfmpegProcess = null;
  }
}

function isVideoExportCancelled() {
  return videoExportCancelRequested;
}

function videoDimensionEven(n) {
  const x = Math.max(2, Math.floor(Number(n) || 0));
  return x + (x % 2);
}

/** Aantal frame_######.png in map (voor encoding-voortgang). */
function countFramePngsInFolder(framesFolder) {
  try {
    const names = fs.readdirSync(framesFolder);
    let n = 0;
    for (const f of names) {
      if (/^frame_\d{6}\.png$/i.test(f)) n++;
    }
    return n;
  } catch (_) {
    return 0;
  }
}

/**
 * Centreert afbeelding op maxW×maxH met zwarte rand (BGRA, zelfde als nativeImage.toBitmap).
 */
function padNativeImageToSize(img, maxW, maxH) {
  if (!img || img.isEmpty()) return img;
  const { width: w, height: h } = img.getSize();
  if (w === maxW && h === maxH) return img;
  let srcBmp;
  try {
    srcBmp = img.toBitmap();
  } catch (_) {
    return img;
  }
  const rowSrc = w * 4;
  const rowDst = maxW * 4;
  const outBuf = Buffer.alloc(maxW * maxH * 4);
  for (let i = 0; i < outBuf.length; i += 4) {
    outBuf[i] = 0;
    outBuf[i + 1] = 0;
    outBuf[i + 2] = 0;
    outBuf[i + 3] = 255;
  }
  const ox = Math.floor((maxW - w) / 2);
  const oy = Math.floor((maxH - h) / 2);
  for (let row = 0; row < h; row++) {
    const dstOff = (oy + row) * rowDst + ox * 4;
    const srcOff = row * rowSrc;
    srcBmp.copy(outBuf, dstOff, srcOff, srcOff + rowSrc);
  }
  try {
    return nativeImage.createFromBitmap(outBuf, { width: maxW, height: maxH });
  } catch (_) {
    return img;
  }
}

/** Schaal proportioneel tot target volledig bedekt is; midden bijsnijden (geen zwarte randen). */
function coverNativeImageToSize(img, targetW, targetH) {
  if (!img || img.isEmpty()) return img;
  const { width: w, height: h } = img.getSize();
  if (w < 1 || h < 1 || targetW < 1 || targetH < 1) return img;
  if (w === targetW && h === targetH) return img;
  const scale = Math.max(targetW / w, targetH / h);
  const newW = Math.max(targetW, Math.ceil(w * scale));
  let resized = img.resize({ width: newW });
  if (resized.isEmpty()) return img;
  let rw = resized.getSize().width;
  let rh = resized.getSize().height;
  if (rh < targetH) {
    const newH = Math.max(targetH, Math.ceil(h * scale));
    resized = img.resize({ height: newH });
    if (resized.isEmpty()) return img;
    rw = resized.getSize().width;
    rh = resized.getSize().height;
  }
  const cx = Math.max(0, Math.floor((rw - targetW) / 2));
  const cy = Math.max(0, Math.floor((rh - targetH) / 2));
  return resized.crop({ x: cx, y: cy, width: targetW, height: targetH });
}

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
      resolve({ ok: false, error: tr('ipc.errorMissingParams') });
      return;
    }
    if (videoExportCancelRequested) {
      resolve({ ok: false, cancelled: true, error: tr('videoExport.cancelled') });
      return;
    }
    const preset = VIDEO_FORMATS[formatId] || VIDEO_FORMATS.h264;
    const totalFrames = countFramePngsInFolder(framesFolder);
    if (typeof onProgress === 'function') onProgress('start', { total: totalFrames });
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
    activeFfmpegProcess = proc;
    let stderr = '';
    let lastSentFrame = 0;
    let lastSentAt = 0;
    proc.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
      if (typeof onProgress !== 'function') return;
      const tail = stderr.slice(-8000);
      const matches = [...tail.matchAll(/frame=\s*(\d+)/g)];
      if (!matches.length) return;
      const frameNum = parseInt(matches[matches.length - 1][1], 10);
      if (!Number.isFinite(frameNum) || frameNum < 1) return;
      const now = Date.now();
      const cur = totalFrames > 0 ? Math.min(frameNum, totalFrames) : frameNum;
      if (cur - lastSentFrame < 6 && now - lastSentAt < 350) return;
      lastSentFrame = cur;
      lastSentAt = now;
      if (totalFrames > 0) {
        onProgress('encoding', { current: cur, total: totalFrames });
      } else {
        onProgress('encoding', { current: cur, total: 0 });
      }
    });
    proc.on('close', (code, signal) => {
      activeFfmpegProcess = null;
      if (videoExportCancelRequested || signal === 'SIGTERM') {
        resolve({ ok: false, cancelled: true, error: tr('videoExport.cancelled') });
        return;
      }
      if (code === 0) {
        if (typeof onProgress === 'function') onProgress('done', null);
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: tr('videoExport.ffmpegAborted', { code: String(code) }) });
      }
    });
    proc.on('error', (err) => {
      activeFfmpegProcess = null;
      resolve({
        ok: false,
        error: err.code === 'ENOENT'
          ? tr('videoExport.ffmpegNotFound')
          : (err.message || tr('videoExport.ffmpegStartFailed'))
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
  const { imagePaths, outputPath, fps = 24, formatId = 'h264', onProgress, uniformFit = 'pad' } = opts || {};
  const useCover = uniformFit === 'cover';
  if (!Array.isArray(imagePaths) || !imagePaths.length || !outputPath) {
    return { ok: false, error: tr('ipc.errorMissingParams') };
  }
  const tempFolder = path.join(os.tmpdir(), `film2frame-video-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tempFolder, { recursive: true });
  try {
    const totalCopySteps = Math.max(1, imagePaths.length * 2);
    if (typeof onProgress === 'function') onProgress('copy', { current: 0, total: totalCopySteps });
    let maxW = 0;
    let maxH = 0;
    for (let i = 0; i < imagePaths.length; i++) {
      if (videoExportCancelRequested) {
        return { ok: false, cancelled: true, error: tr('videoExport.cancelled') };
      }
      if (typeof onProgress === 'function') {
        onProgress('copy', { current: i + 1, total: totalCopySteps });
      }
      const img = nativeImage.createFromPath(imagePaths[i]);
      if (img.isEmpty()) continue;
      const s = img.getSize();
      maxW = Math.max(maxW, s.width);
      maxH = Math.max(maxH, s.height);
    }
    if (videoExportCancelRequested) {
      return { ok: false, cancelled: true, error: tr('videoExport.cancelled') };
    }
    if (maxW < 1 || maxH < 1) {
      return { ok: false, error: tr('videoExportMain.errorNoValidImages') };
    }
    const uniW = videoDimensionEven(maxW);
    const uniH = videoDimensionEven(maxH);
    for (let i = 0; i < imagePaths.length; i++) {
      if (videoExportCancelRequested) {
        return { ok: false, cancelled: true, error: tr('videoExport.cancelled') };
      }
      if (typeof onProgress === 'function') {
        onProgress('copy', { current: imagePaths.length + i + 1, total: totalCopySteps });
      }
      const src = imagePaths[i];
      const idx = i + 1;
      const dest = path.join(tempFolder, `frame_${String(idx).padStart(6, '0')}.png`);
      const ext = path.extname(src).toLowerCase();
      const img = nativeImage.createFromPath(src);
      if (img.isEmpty()) continue;
      const s = img.getSize();
      if (ext === '.png' && s.width === uniW && s.height === uniH) {
        fs.copyFileSync(src, dest);
      } else {
        const outImg = useCover ? coverNativeImageToSize(img, uniW, uniH) : padNativeImageToSize(img, uniW, uniH);
        fs.writeFileSync(dest, outImg.toPNG());
      }
    }
    if (videoExportCancelRequested) {
      return { ok: false, cancelled: true, error: tr('videoExport.cancelled') };
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
  getVideoFormats,
  beginVideoExportJob,
  cancelVideoExport,
  isVideoExportCancelled
};
