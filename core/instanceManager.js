const crypto = require("crypto");
const path = require("path");
const { ensureDir, readJson, sanitizeName, writeJson } = require("./fsUtils");

class InstanceManager {
  constructor(settingsStore) {
    this.settingsStore = settingsStore;
  }

  get instancesDir() {
    return this.settingsStore.get("instancesDir") || path.join(process.cwd(), "instances");
  }

  async init() {
    await ensureDir(this.instancesDir);
  }

  async listInstances() {
    await this.init();
    const fs = require("fs/promises");
    const entries = await fs.readdir(this.instancesDir, { withFileTypes: true });
    const instances = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const configPath = path.join(this.instancesDir, entry.name, "instance.json");
      try {
        instances.push(this.normalizeInstance(await readJson(configPath)));
      } catch {
        continue;
      }
    }
    return instances.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getInstance(instanceId) {
    const configPath = path.join(this.instancesDir, instanceId, "instance.json");
    try {
      return this.normalizeInstance(await readJson(configPath));
    } catch {
      return null;
    }
  }

  async createInstance(payload) {
    const id = `${sanitizeName(payload.name)}-${crypto.randomBytes(3).toString("hex")}`;
    const instanceDir = path.join(this.instancesDir, id);
    const minecraftDir = this.resolveMinecraftDir({ id, versionId: payload.versionId, instanceDir });
    const loader = this.normalizeLoader(payload.loader, payload.versionId);
    const instance = {
      id,
      name: payload.name || "New Instance",
      versionId: payload.versionId,
      ramMb: Number(payload.ramMb || this.settingsStore.get("ramMb") || 4096),
      autoMemory: payload.autoMemory ?? this.settingsStore.get("autoMemory") ?? true,
      javaPath: payload.javaPath || "",
      javaArgs: payload.javaArgs || this.settingsStore.get("javaArgs") || "",
      minecraftArgs: payload.minecraftArgs || this.settingsStore.get("minecraftArgs") || "",
      proxyEnabled: payload.proxyEnabled ?? this.settingsStore.get("proxyEnabled") ?? false,
      proxyServer: payload.proxyServer || this.settingsStore.get("proxyServer") || "127.0.0.1:8080",
      proxyArgs: payload.proxyArgs || this.settingsStore.get("proxyArgs") || "",
      wrapperCommand: payload.wrapperCommand || this.settingsStore.get("wrapperCommand") || "",
      windowWidth: Number(payload.windowWidth || this.settingsStore.get("windowWidth") || 925),
      windowHeight: Number(payload.windowHeight || this.settingsStore.get("windowHeight") || 530),
      fullscreen: payload.fullscreen ?? this.settingsStore.get("fullscreen") ?? false,
      offlineUsername: payload.offlineUsername || "Player",
      loader,
      javaMode: payload.javaMode || this.settingsStore.get("javaMode") || "recommended",
      instanceDir,
      minecraftDir,
      createdAt: new Date().toISOString()
    };

    await this.ensureMinecraftFolders(instance);
    await writeJson(path.join(instanceDir, "instance.json"), instance);
    return instance;
  }

  async updateInstance(instanceId, patch) {
    const instance = await this.getInstance(instanceId);
    if (!instance) throw new Error(`Instance not found: ${instanceId}`);

    const merged = {
      ...instance,
      ...patch,
      ramMb: Number(patch.ramMb ?? instance.ramMb),
      windowWidth: Number(patch.windowWidth ?? instance.windowWidth ?? 925),
      windowHeight: Number(patch.windowHeight ?? instance.windowHeight ?? 530),
      loader: this.normalizeLoader(patch.loader || instance.loader || "Vanilla", patch.versionId || instance.versionId),
      javaMode: patch.javaMode || instance.javaMode || this.settingsStore.get("javaMode") || "recommended",
      proxyEnabled: patch.proxyEnabled ?? instance.proxyEnabled ?? this.settingsStore.get("proxyEnabled") ?? false,
      proxyServer: patch.proxyServer || instance.proxyServer || this.settingsStore.get("proxyServer") || "127.0.0.1:8080",
      proxyArgs: patch.proxyArgs || instance.proxyArgs || this.settingsStore.get("proxyArgs") || "",
      updatedAt: new Date().toISOString()
    };
    const updated = this.normalizeInstance(merged);

    await this.ensureMinecraftFolders(updated);
    await writeJson(path.join(this.instancesDir, instanceId, "instance.json"), updated);
    return updated;
  }

  normalizeInstance(instance) {
    const updated = {
      ...instance,
      loader: this.normalizeLoader(instance.loader, instance.versionId),
      minecraftDir: this.resolveMinecraftDir(instance),
      proxyEnabled: instance.proxyEnabled ?? this.settingsStore.get("proxyEnabled") ?? false,
      proxyServer: instance.proxyServer || this.settingsStore.get("proxyServer") || "127.0.0.1:8080",
      proxyArgs: instance.proxyArgs || this.settingsStore.get("proxyArgs") || ""
    };
    return updated;
  }

  normalizeLoader(loader, versionId = "") {
    const inferred = inferLoaderFromVersionId(versionId);
    if (inferred) return inferred;
    return String(loader || "Vanilla");
  }

  resolveMinecraftDir(instance) {
    const mode = this.settingsStore.get("separateFoldersMode") || "none";
    if (mode === "none") {
      return this.settingsStore.get("gameDir");
    }
    if (mode === "versions") {
      const versionId = instance?.versionId || "shared";
      return path.join(this.settingsStore.get("gameDir"), "instances", versionId);
    }
    return path.join(this.instancesDir, instance?.id || "instance", "minecraft");
  }

  async ensureMinecraftFolders(instance) {
    await ensureDir(instance.minecraftDir);
    await ensureDir(path.join(instance.minecraftDir, "mods"));
    await ensureDir(path.join(instance.minecraftDir, "config"));
    await ensureDir(path.join(instance.minecraftDir, "saves"));
  }
}

function inferLoaderFromVersionId(versionId) {
  const id = String(versionId || "").toLowerCase();
  if (!id) return "";
  if (id.includes("fabric")) return "Fabric";
  if (id.includes("forge")) return "Forge";
  if (id.includes("neoforge")) return "NeoForge";
  if (id.includes("quilt")) return "Quilt";
  return "Vanilla";
}

module.exports = { InstanceManager };
