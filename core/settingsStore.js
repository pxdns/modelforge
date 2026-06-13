const path = require("path");
const { defaultLauncherDir, defaultMinecraftDir } = require("./paths");
const { ensureDir, readJson, writeJson } = require("./fsUtils");

class SettingsStore {
  constructor() {
    this.launcherDir = defaultLauncherDir();
    this.filePath = path.join(this.launcherDir, "settings.json");
    this.settings = null;
  }

  async init() {
    await ensureDir(this.launcherDir);
    this.settings = await readJson(this.filePath, {
      launcherDir: this.launcherDir,
      instancesDir: path.join(process.cwd(), "instances"),
      gameDir: defaultMinecraftDir(),
      separateFoldersMode: "none",
      offlineUsername: "Player",
      ramMb: 4096,
      autoMemory: true,
      javaMode: "custom",
      javaPath: "",
      javaArgs: "",
      minecraftArgs: "",
      wrapperCommand: "",
      updateSslCertificates: true,
      improvedJvmArguments: "default",
      windowWidth: 925,
      windowHeight: 530,
      fullscreen: false,
      delayedStart: false,
      forceUpdate: false,
      versionFilters: {
        release: true,
        remote: true,
        modified: true,
        fabric: true,
        forge: true,
        neoForge: true,
        quilt: true,
        alpha: false,
        experimental: true,
        installedOnly: false,
        snapshots: true,
        beta: false,
        launchers: false,
        oldReleases: true
      },
      suggestServers: false,
      theme: "dark"
    });
    await this.save();
  }

  getAll() {
    return { ...this.settings };
  }

  get(key) {
    return this.settings[key];
  }

  async setGameDir(gameDir) {
    this.settings.gameDir = gameDir;
    await this.save();
  }

  async setMany(patch) {
    this.settings = { ...this.settings, ...patch };
    await this.save();
  }

  async save() {
    await writeJson(this.filePath, this.settings);
  }
}

module.exports = { SettingsStore };
