// src/resume.ts
var MARGIN_MS = 2 * 60 * 1000;
function resumeKey2(brand, person) {
  return `${brand}-inbox:${person}`;
}
function defaultResumeStorage2() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
function webOriginOf2(address) {
  try {
    const parsed = new URL(address);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}
function readResume2(storage, key, now) {
  const stored = storedEntry(storage, key);
  if (stored === null) {
    return null;
  }
  const url = "url" in stored && typeof stored.url === "string" ? stored.url : null;
  const origin = "origin" in stored && typeof stored.origin === "string" ? stored.origin : null;
  const until = "until" in stored && typeof stored.until === "string" ? stored.until : null;
  if (url === null || origin === null || until === null || webOriginOf2(url) !== origin) {
    return null;
  }
  const deadline = Date.parse(until);
  if (Number.isNaN(deadline) || now >= deadline - MARGIN_MS) {
    return null;
  }
  return { url, origin, until };
}
function rememberResume2(storage, key, entry) {
  try {
    storage?.setItem(key, JSON.stringify(entry));
  } catch {
    return;
  }
}
function forgetResumeIf2(storage, key, url) {
  const stored = storedEntry(storage, key);
  if (stored === null || !("url" in stored) || stored.url !== url) {
    return;
  }
  try {
    storage?.removeItem(key);
  } catch {
    return;
  }
}
function forgetOtherResumes2(storage, brand, key) {
  if (storage === null) {
    return;
  }
  const prefix = resumeKey2(brand, "");
  try {
    const stale = [];
    for (let index = 0;index < storage.length; index++) {
      const candidate = storage.key(index);
      if (candidate !== null && candidate.startsWith(prefix) && candidate !== key) {
        stale.push(candidate);
      }
    }
    stale.forEach((candidate) => storage.removeItem(candidate));
  } catch {
    return;
  }
}
function forgetAllResumes2(storage, brand) {
  forgetOtherResumes2(storage, brand, null);
}
function storedEntry(storage, key) {
  if (storage === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "null");
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export { resumeKey2, defaultResumeStorage2, webOriginOf2, readResume2, rememberResume2, forgetResumeIf2, forgetOtherResumes2, forgetAllResumes2 };
