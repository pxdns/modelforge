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
        instances.push(await readJson(configPath));
      } catch {
        continue;
      }
    }
    return instances.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getInstance(instanceId) {
    const configPath = path.join(this.instancesDir, instanceId, "instance.json");
    try {
      return readJson(configPath);
    } catch {
      return null;
    }
  }

  async createInstance(payload) {
    const id = `${sanitizeName(payload.name)}-${crypto.randomBytes(3).toString("hex")}`;
    const instanceDir = path.join(this.instancesDir, id);
    const minecraftDir = path.join(instanceDir, "minecraft");
    const instance = {
      id,
      name: payload.name || "New Instance",
      versionId: payload.versionId,
      ramMb: Number(payload.ramMb || this.settingsStore.get("ramMb") || 4096),
      autoMemory: payload.autoMemory ?? this.settingsStore.get("autoMemory") ?? true,
      javaPath: payload.javaPath || "",
      javaArgs: payload.javaArgs || this.settingsStore.get("javaArgs") || "",
      minecraftArgs: payload.minecraftArgs || this.settingsStore.get("minecraftArgs") || "",
      wrapperCommand: payload.wrapperCommand || this.settingsStore.get("wrapperCommand") || "",
      windowWidth: Number(payload.windowWidth || this.settingsStore.get("windowWidth") || 925),
      windowHeight: Number(payload.windowHeight || this.settingsStore.get("windowHeight") || 530),
      fullscreen: payload.fullscreen ?? this.settingsStore.get("fullscreen") ?? false,
      offlineUsername: payload.offlineUsername || "Player",
      instanceDir,
      minecraftDir,
      createdAt: new Date().toISOString()
    };

    await ensureDir(path.join(minecraftDir, "mods"));
    await ensureDir(path.join(minecraftDir, "config"));
    await ensureDir(path.join(minecraftDir, "saves"));
    await writeJson(path.join(instanceDir, "instance.json"), instance);
    return instance;
  }

  async updateInstance(instanceId, patch) {
    const instance = await this.getInstance(instanceId);
    if (!instance) throw new Error(`Instance not found: ${instanceId}`);

    const updated = {
      ...instance,
      ...patch,
      ramMb: Number(patch.ramMb ?? instance.ramMb),
      windowWidth: Number(patch.windowWidth ?? instance.windowWidth ?? 925),
      windowHeight: Number(patch.windowHeight ?? instance.windowHeight ?? 530),
      updatedAt: new Date().toISOString()
    };
    await writeJson(path.join(this.instancesDir, instanceId, "instance.json"), updated);
    return updated;
  }
}

module.exports = { InstanceManager };
