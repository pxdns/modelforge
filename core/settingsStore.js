const path = require("path");
const { defaultLauncherDir, defaultMinecraftDir } = require("./paths");
const { ensureDir, readJson, writeJson } = require("./fsUtils");
const {
  readLegacyArgs,
  readLegacyBootArgs,
  readLegacyCfg,
  writeLegacyArgs,
  writeLegacyBootArgs,
  writeLegacyCfg
} = require("./legacyCompat");

class SettingsStore {
  constructor() {
    this.launcherDir = defaultLauncherDir();
    this.filePath = path.join(this.launcherDir, "settings.json");
    this.settings = null;
  }

  async init() {
    await ensureDir(this.launcherDir);
    const jsonSettings = await readJson(this.filePath, {
      launcherDir: this.launcherDir,
      instancesDir: path.join(process.cwd(), "instances"),
      gameDir: defaultMinecraftDir(),
      separateFoldersMode: "none",
      offlineUsername: "Player",
      ramMb: 4096,
      autoMemory: true,
      javaMode: "recommended",
      javaPath: "",
      javaArgs: "",
      minecraftArgs: "",
      proxyEnabled: false,
      proxyServer: "127.0.0.1:8080",
      proxyArgs: "",
      wrapperCommand: "",
      updateSslCertificates: true,
      improvedJvmArguments: "default",
      windowWidth: 925,
      windowHeight: 530,
      fullscreen: false,
      delayedStart: false,
      forceUpdate: false,
      versionId: "",
      backgroundPath: "",
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
    const legacyCfg = await readLegacyCfg(path.join(this.launcherDir, "TL.cfg"));
    const legacyArgs = await readLegacyArgs(path.join(this.launcherDir, "tl.args"));
    const legacyBootArgs = await readLegacyBootArgs(path.join(this.launcherDir, "tl.bootargs"));
    this.settings = {
      ...jsonSettings,
      ...(legacyCfg ? {
        gameDir: legacyCfg["Launcher.gameDir"] || jsonSettings.gameDir,
        javaMode: legacyCfg["Launcher.javaMode"] || jsonSettings.javaMode,
        javaPath: legacyCfg["Launcher.javaPath"] || jsonSettings.javaPath,
        offlineUsername: legacyCfg["Launcher.offlineUsername"] || jsonSettings.offlineUsername,
        ramMb: Number(legacyCfg["Launcher.ramMb"] || jsonSettings.ramMb),
        windowWidth: Number(legacyCfg["Launcher.windowWidth"] || jsonSettings.windowWidth),
        windowHeight: Number(legacyCfg["Launcher.windowHeight"] || jsonSettings.windowHeight),
        fullscreen: String(legacyCfg["Launcher.fullscreen"] || jsonSettings.fullscreen) === "true",
        theme: legacyCfg["Launcher.theme"] || jsonSettings.theme,
        proxyEnabled: String(legacyCfg["Launcher.proxyEnabled"] || jsonSettings.proxyEnabled) === "true",
        proxyServer: legacyCfg["Launcher.proxyServer"] || jsonSettings.proxyServer,
        proxyArgs: legacyCfg["Launcher.proxyArgs"] || jsonSettings.proxyArgs
      } : {}),
      ...(legacyArgs ? {
        gameDir: legacyArgs.directory || jsonSettings.gameDir,
        javaArgs: legacyArgs.javaargs || jsonSettings.javaArgs,
        minecraftArgs: legacyArgs.margs || jsonSettings.minecraftArgs,
        offlineUsername: legacyArgs.usernane || legacyArgs.username || jsonSettings.offlineUsername,
        versionId: legacyArgs.version || jsonSettings.versionId,
        backgroundPath: legacyArgs.background || jsonSettings.backgroundPath
      } : {}),
      ...(legacyBootArgs ? {
        bootJavaArgs: legacyBootArgs
      } : {})
    };
    if (process.platform === "darwin" && !String(this.settings.gameDir || "").trim()) {
      this.settings.gameDir = defaultMinecraftDir();
    }
    if (!String(this.settings.proxyServer || "").trim()) {
      this.settings.proxyServer = "127.0.0.1:8080";
    }
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
    await writeLegacyCfg(path.join(this.launcherDir, "TL.cfg"), this.settings);
    await writeLegacyArgs(path.join(this.launcherDir, "tl.args"), this.settings);
    await writeLegacyBootArgs(path.join(this.launcherDir, "tl.bootargs"), this.settings);
  }
}

module.exports = { SettingsStore };
