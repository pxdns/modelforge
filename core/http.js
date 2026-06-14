const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { Readable } = require("stream");
const { ensureDir, pathExists } = require("./fsUtils");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function fetchWithRetry(url, options = {}) {
  const { retries = 3, retryDelay = 500, init = {} } = options;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await sleep(retryDelay * (attempt + 1));
    }
  }

  throw lastError;
}

async function sha1File(filePath) {
  const hash = crypto.createHash("sha1");
  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve);
  });
  return hash.digest("hex");
}

async function downloadFile(url, destination, options = {}) {
  const { sha1, size, label = path.basename(destination), onProgress, retries = 3 } = options;

  if (await pathExists(destination)) {
    if (!sha1 || (await sha1File(destination)) === sha1) {
      onProgress?.({ label, phase: "cached", current: size || 0, total: size || 0 });
      return destination;
    }
  }

  await ensureDir(path.dirname(destination));
  const tempPath = `${destination}.part`;
  let existingBytes = 0;
  if (await pathExists(tempPath)) {
    existingBytes = (await fsp.stat(tempPath)).size;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers = {};
      const writeOptions = { flags: "w" };
      if (existingBytes > 0) {
        headers.Range = `bytes=${existingBytes}-`;
        writeOptions.flags = "a";
      }

      const response = await fetchWithRetry(url, { init: { headers }, retries: 0 });
      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      const supportsResume = response.status === 206;
      if (existingBytes > 0 && !supportsResume) {
        existingBytes = 0;
        writeOptions.flags = "w";
      }

      const totalFromHeader = Number(response.headers.get("content-length") || 0);
      const contentRange = response.headers.get("content-range");
      const total = contentRange
        ? Number(contentRange.split("/").pop() || 0)
        : (existingBytes > 0 ? existingBytes + totalFromHeader : totalFromHeader || size || 0);
      let current = existingBytes;
      const writer = fs.createWriteStream(tempPath, writeOptions);
      const readable = typeof response.body?.on === "function"
        ? response.body
        : Readable.fromWeb(response.body);

      await new Promise((resolve, reject) => {
        readable.on("data", (chunk) => {
          current += chunk.length;
          onProgress?.({ label, phase: "downloading", current, total });
        });
        readable.on("error", reject);
        writer.on("error", reject);
        writer.on("finish", resolve);
        readable.pipe(writer, { end: true });
      });

      break;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      await sleep(500 * (attempt + 1));
      existingBytes = await pathExists(tempPath) ? (await fsp.stat(tempPath)).size : 0;
    }
  }

  if (sha1) {
    const actualSha1 = await sha1File(tempPath);
    if (actualSha1 !== sha1) {
      await fsp.rm(tempPath, { force: true });
      throw new Error(`Checksum mismatch for ${label}`);
    }
  }

  await fsp.rename(tempPath, destination);
  onProgress?.({ label, phase: "done", current: total, total });
  return destination;
}

module.exports = {
  downloadFile,
  fetchJson,
  sha1File
};
