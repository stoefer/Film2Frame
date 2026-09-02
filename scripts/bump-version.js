/**
 * Bump versions.
 *
 * build version (version.json): YYYYMMDDNNN
 * - Same day: increment NNN (001, 002, …)
 * - New day: set date to today and NNN to 001
 *
 * package version (package.json/package-lock.json):
 * - Optional patch bump when --bump-package is passed
 */
const fs = require('fs');
const path = require('path');

const versionPath = path.join(__dirname, '..', 'version.json');
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageLockPath = path.join(__dirname, '..', 'package-lock.json');
const shouldBumpPackage = process.argv.includes('--bump-package');
const today = new Date();
const dateStr = today.getFullYear() +
  String(today.getMonth() + 1).padStart(2, '0') +
  String(today.getDate()).padStart(2, '0');

let data = { buildVersion: '20260318001' };
if (fs.existsSync(versionPath)) {
  try {
    data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  } catch (_) {}
}

const current = String(data.buildVersion || '20260318001');
const currentDate = current.length >= 8 ? current.slice(0, 8) : '';
const currentSeq = current.length > 8 ? parseInt(current.slice(8), 10) : 0;
const seq = Number.isFinite(currentSeq) && currentSeq >= 0 ? currentSeq : 0;

let nextVersion;
if (currentDate === dateStr) {
  nextVersion = dateStr + String(seq + 1).padStart(3, '0');
} else {
  nextVersion = dateStr + '001';
}

data.buildVersion = nextVersion;
fs.writeFileSync(versionPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('Build version:', nextVersion);

function bumpPatchVersion(ver) {
  const m = String(ver || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
  return `${major}.${minor}.${patch + 1}${m[4] || ''}`;
}

if (shouldBumpPackage) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const nextPkgVersion = bumpPatchVersion(pkg.version);
    if (nextPkgVersion) {
      pkg.version = nextPkgVersion;
      fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      console.log('Package version:', nextPkgVersion);

      if (fs.existsSync(packageLockPath)) {
        const lock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
        lock.version = nextPkgVersion;
        if (lock.packages && lock.packages[''] && typeof lock.packages[''] === 'object') {
          lock.packages[''].version = nextPkgVersion;
        }
        fs.writeFileSync(packageLockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
      }
    } else {
      console.warn('Package version not bumped: invalid semver in package.json');
    }
  } catch (err) {
    console.warn('Package version bump failed:', err && err.message ? err.message : err);
  }
}
