const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { Readable } = require("stream");
const { ensureDir, pathExists } = require("./fsUtils");

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
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
  const { sha1, size, label = path.basename(destination), onProgress } = options;

  if (await pathExists(destination)) {
    if (!sha1 || (await sha1File(destination)) === sha1) {
      onProgress?.({ label, phase: "cached", current: size || 0, total: size || 0 });
      return destination;
    }
  }

  await ensureDir(path.dirname(destination));
  const tempPath = `${destination}.part`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

  const total = Number(response.headers.get("content-length") || size || 0);
  let current = 0;
  const writer = fs.createWriteStream(tempPath);
  const readable = typeof response.body.on === "function"
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
    readable.pipe(writer);
  });

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
