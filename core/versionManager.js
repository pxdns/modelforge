const fs = require("fs/promises");
const path = require("path");
const { downloadFile, fetchJson } = require("./http");
const { ensureDir, pathExists, readJson, writeJson } = require("./fsUtils");
const { currentOsName, isAllowed } = require("./rules");

const MANIFEST_URL = "https://launchermeta.mojang.com/mc/game/version_manifest.json";

class VersionManager {
  constructor(settingsStore) {
    this.settingsStore = settingsStore;
  }

  get gameDir() {
    return this.settingsStore.get("gameDir");
  }

  async getManifest({ forceRefresh = false, onProgress } = {}) {
    const manifestPath = path.join(this.gameDir, "version_manifest.json");
    if (!forceRefresh && await pathExists(manifestPath)) {
      return readJson(manifestPath);
    }

    onProgress?.({ label: "version manifest", phase: "downloading", current: 0, total: 1 });
    try {
      const manifest = await fetchJson(MANIFEST_URL);
      await writeJson(manifestPath, manifest);
      onProgress?.({ label: "version manifest", phase: "done", current: 1, total: 1 });
      return manifest;
    } catch (error) {
      if (await pathExists(manifestPath)) {
        return readJson(manifestPath);
      }
      const installedManifest = await this.getInstalledManifest();
      if (installedManifest.versions.length > 0) {
        return installedManifest;
      }
      throw error;
    }
  }

  async getVersionJson(versionId, options = {}) {
    const versionDir = path.join(this.gameDir, "versions", versionId);
    const versionJsonPath = path.join(versionDir, `${versionId}.json`);

    if (await pathExists(versionJsonPath)) return readJson(versionJsonPath);

    const manifest = await this.getManifest(options);
    const entry = manifest.versions.find((version) => version.id === versionId);
    if (!entry) throw new Error(`Version not found in manifest: ${versionId}`);

    try {
      const versionJson = await fetchJson(entry.url);
      await writeJson(versionJsonPath, versionJson);
      return versionJson;
    } catch (error) {
      if (await pathExists(versionJsonPath)) return readJson(versionJsonPath);
      throw error;
    }
  }

  async getInstalledManifest() {
    const versionsDir = path.join(this.gameDir, "versions");
    const manifest = {
      latest: {},
      versions: []
    };

    let entries = [];
    try {
      entries = await fs.readdir(versionsDir, { withFileTypes: true });
    } catch {
      return manifest;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const versionId = entry.name;
      const jsonPath = path.join(versionsDir, versionId, `${versionId}.json`);
      if (!(await pathExists(jsonPath))) continue;
      try {
        const versionJson = await readJson(jsonPath);
        manifest.versions.push({
          id: versionJson.id || versionId,
          type: versionJson.type || "release",
          url: jsonPath,
          time: versionJson.time || "",
          releaseTime: versionJson.releaseTime || ""
        });
      } catch {
        continue;
      }
    }

    manifest.versions.sort((a, b) => String(b.releaseTime || b.time || "").localeCompare(String(a.releaseTime || a.time || "")));
    return manifest;
  }

  async ensureVersion(versionId, { onProgress } = {}) {
    const versionJson = await this.getVersionJson(versionId, { onProgress });
    const versionDir = path.join(this.gameDir, "versions", versionId);
    await ensureDir(versionDir);

    await this.downloadClient(versionId, versionJson, onProgress);
    await this.downloadLibraries(versionJson, onProgress);
    await this.downloadAssets(versionJson, onProgress);

    return {
      id: versionId,
      mainClass: versionJson.mainClass,
      versionDir
    };
  }

  async downloadClient(versionId, versionJson, onProgress) {
    const client = versionJson.downloads?.client;
    if (!client) throw new Error(`No client download found for ${versionId}`);

    await downloadFile(
      client.url,
      path.join(this.gameDir, "versions", versionId, `${versionId}.jar`),
      {
        sha1: client.sha1,
        size: client.size,
        label: `${versionId} client`,
        onProgress
      }
    );
  }

  async downloadLibraries(versionJson, onProgress) {
    const downloads = [];
    for (const library of versionJson.libraries || []) {
      if (!isAllowed(library.rules)) continue;
      const artifact = library.downloads?.artifact;
      if (artifact) {
        downloads.push(this.downloadLibraryArtifact(artifact, onProgress));
      }

      const nativesKey = library.natives?.[currentOsName()];
      const classifier = nativesKey ? nativesKey.replace("${arch}", process.arch === "x64" ? "64" : "32") : null;
      const nativeArtifact = classifier ? library.downloads?.classifiers?.[classifier] : null;
      if (nativeArtifact) {
        downloads.push(this.downloadLibraryArtifact(nativeArtifact, onProgress));
      }
    }

    await runLimited(downloads, 8);
  }

  downloadLibraryArtifact(artifact, onProgress) {
    return async () => downloadFile(
      artifact.url,
      path.join(this.gameDir, "libraries", artifact.path),
      {
        sha1: artifact.sha1,
        size: artifact.size,
        label: artifact.path,
        onProgress
      }
    );
  }

  async downloadAssets(versionJson, onProgress) {
    const assetIndex = versionJson.assetIndex;
    if (!assetIndex) return;

    const indexPath = path.join(this.gameDir, "assets", "indexes", `${assetIndex.id}.json`);
    await downloadFile(assetIndex.url, indexPath, {
      sha1: assetIndex.sha1,
      size: assetIndex.size,
      label: `asset index ${assetIndex.id}`,
      onProgress
    });

    const index = await readJson(indexPath);
    const tasks = Object.entries(index.objects || {}).map(([name, object]) => {
      return async () => {
        const prefix = object.hash.slice(0, 2);
        const destination = path.join(this.gameDir, "assets", "objects", prefix, object.hash);
        return downloadFile(
          `https://resources.download.minecraft.net/${prefix}/${object.hash}`,
          destination,
          {
            sha1: object.hash,
            size: object.size,
            label: name,
            onProgress
          }
        );
      };
    });

    await runLimited(tasks, 16);
  }

  async getClasspath(versionJson) {
    const entries = [];
    for (const library of versionJson.libraries || []) {
      if (!isAllowed(library.rules)) continue;
      const artifact = library.downloads?.artifact;
      if (artifact) entries.push(path.join(this.gameDir, "libraries", artifact.path));
    }
    entries.push(path.join(this.gameDir, "versions", versionJson.id, `${versionJson.id}.jar`));
    return entries;
  }

  async getNativeArtifacts(versionJson) {
    const artifacts = [];
    for (const library of versionJson.libraries || []) {
      if (!isAllowed(library.rules)) continue;
      const nativesKey = library.natives?.[currentOsName()];
      if (!nativesKey) continue;
      const classifier = nativesKey.replace("${arch}", process.arch === "x64" ? "64" : "32");
      const artifact = library.downloads?.classifiers?.[classifier];
      if (artifact) {
        artifacts.push({
          path: path.join(this.gameDir, "libraries", artifact.path),
          exclude: library.extract?.exclude || []
        });
      }
    }
    return artifacts;
  }

  async extractNatives(versionJson, destination) {
    await fs.rm(destination, { recursive: true, force: true });
    await ensureDir(destination);

    const nativeArtifacts = await this.getNativeArtifacts(versionJson);
    for (const artifact of nativeArtifacts) {
      await extractZip(artifact.path, destination, artifact.exclude);
    }
  }
}

async function runLimited(tasks, limit) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (index < tasks.length) {
      const task = tasks[index++];
      await task();
    }
  });
  await Promise.all(workers);
}

async function extractZip(zipPath, destination, excludes) {
  const { execFile } = require("child_process");
  const fs = require("fs/promises");
  const tempDir = `${destination}-zip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await ensureDir(tempDir);
  try {
    await new Promise((resolve, reject) => {
      const command = process.platform === "win32" ? "tar.exe" : "tar";
      const child = execFile(command, ["-xf", zipPath, "-C", tempDir], (error) => {
        if (error) reject(error);
        else resolve();
      });
      child.stdin?.end();
    });
    await copyFiltered(tempDir, tempDir, destination, excludes);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function copyFiltered(root, source, destination, excludes) {
  const fs = require("fs/promises");
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const relative = path.relative(root, sourcePath).replace(/\\/g, "/");
    if (excludes.some((prefix) => relative.startsWith(prefix))) continue;

    const destinationPath = path.join(destination, path.relative(root, sourcePath));
    if (entry.isDirectory()) {
      await ensureDir(destinationPath);
      await copyFiltered(root, sourcePath, destination, excludes);
    } else {
      await ensureDir(path.dirname(destinationPath));
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

module.exports = { VersionManager };
