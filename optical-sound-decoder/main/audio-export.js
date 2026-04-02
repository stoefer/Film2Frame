const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = null;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      reject(new Error('ffmpeg-static niet gevonden; voer npm install uit.'));
      return;
    }
    const p = spawn(ffmpegPath, args, { windowsHide: true });
    let err = '';
    p.stderr?.on('data', (d) => {
      err += d.toString();
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg eindcode ${code}: ${err.slice(-400)}`));
    });
  });
}

/**
 * @param {Buffer} wavBuffer
 * @param {string} outPath
 * @param {'wav'|'mp3'} format
 */
async function writeAudioExport(wavBuffer, outPath, format) {
  if (format === 'wav') {
    await fs.promises.writeFile(outPath, wavBuffer);
    return { ok: true };
  }
  if (format === 'mp3') {
    const tmp = path.join(os.tmpdir(), `osd-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    await fs.promises.writeFile(tmp, wavBuffer);
    try {
      await runFfmpeg(['-y', '-i', tmp, '-codec:a', 'libmp3lame', '-q:a', '2', outPath]);
      return { ok: true };
    } finally {
      fs.unlink(tmp, () => {});
    }
  }
  return { ok: false, error: 'unknown format' };
}

module.exports = { writeAudioExport, hasFfmpeg: () => !!ffmpegPath && fs.existsSync(ffmpegPath) };
