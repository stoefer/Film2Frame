/**
 * Strip-cache: alleen vorige en volgende scanlint in geheugen.
 * Vermindert belasting bij grote mappen; geen volledige directory cache.
 */
import { loadImage } from './strip-loader.js';

let cache = { prev: null, next: null };

export function getFromCache(path) {
  if (!path) return null;
  if (cache.prev && cache.prev.path === path) return cache.prev.image;
  if (cache.next && cache.next.path === path) return cache.next.image;
  return null;
}

export function setCachePrev(path, image) {
  cache.prev = path && image ? { path, image } : null;
}

export function setCacheNext(path, image) {
  cache.next = path && image ? { path, image } : null;
}

export function clearCache() {
  cache.prev = null;
  cache.next = null;
}

/**
 * Prefetch vorige en volgende scan in de achtergrond.
 * @param {string[]} paths - alle scanpaden
 * @param {number} currentIndex - index van de nu geladen scan
 * @param {string} currentPath - pad van de nu geladen scan (om te verifiëren bij async callback)
 * @param {function(string): Promise<string>} getFileUrl - api.getFileUrl
 * @param {function(): { path: string }} getState - om te controleren of gebruiker niet gewisseld is
 */
export function prefetch(paths, currentIndex, currentPath, getFileUrl, getState) {
  if (!paths || !paths.length || !getFileUrl) return;

  const prevPath = currentIndex > 0 ? paths[currentIndex - 1] : null;
  const nextPath = currentIndex >= 0 && currentIndex < paths.length - 1 ? paths[currentIndex + 1] : null;

  const stillCurrent = () => getState && getState().path === currentPath;

  if (prevPath) {
    getFileUrl(prevPath).then(fileUrl => loadImage(prevPath, fileUrl)).then(img => {
      if (img && stillCurrent()) setCachePrev(prevPath, img);
    }).catch(() => {});
  } else {
    setCachePrev(null, null);
  }

  if (nextPath) {
    getFileUrl(nextPath).then(fileUrl => loadImage(nextPath, fileUrl)).then(img => {
      if (img && stillCurrent()) setCacheNext(nextPath, img);
    }).catch(() => {});
  } else {
    setCacheNext(null, null);
  }
}
