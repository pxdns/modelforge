const crypto = require("crypto");
const EventEmitter = require("events");
const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { ensureDir } = require("./fsUtils");
const { isAllowed } = require("./rules");
const { JavaDetector } = require("./javaDetector");

class MinecraftLauncher extends EventEmitter {
  constructor(settingsStore, versionManager, modManager = null) {
    super();
    this.settingsStore = settingsStore;
    this.versionManager = versionManager;
    this.modManager = modManager;
    this.process = null;
  }

  async launch(instance) {
    if (this.modManager) {
      await this.modManager.ensureProtectedMods(instance);
    }

    const versionId = await this.resolveVersionId(instance);
    const versionJson = await this.versionManager.getVersionJson(versionId);

    if (this.modManager) {
      const mods = await this.modManager.listMods(instance);
      const incompatible = mods.filter((mod) => this.modManager.evaluateMod(mod, instance, versionJson).incompatible);
      if (incompatible.length > 0) {
        this.emit("log", `Found ${incompatible.length} incompatible mod${incompatible.length === 1 ? "" : "s"}; leaving them in place.`);
      }
    }

    await this.versionManager.ensureVersion(versionId, {
      onProgress: (payload) => this.emit("progress", payload)
    });

    await ensureDir(instance.minecraftDir);

    const nativesDir = path.join(instance.instanceDir, "natives", versionId);
    await this.versionManager.extractNatives(versionJson, nativesDir);

    const javaPath = await this.resolveJavaPath(instance);
    const args = await this.buildArguments(instance, versionJson, nativesDir);

    this.emit("log", `Launching ${instance.name} (${versionId})`);
    this.emit("log", `${javaPath} ${args.map(quoteArg).join(" ")}`);

    this.process = spawn(javaPath, args, {
      cwd: instance.minecraftDir,
      windowsHide: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    this.process.stdout.on("data", (chunk) => this.emit("log", chunk.toString()));
    this.process.stderr.on("data", (chunk) => this.emit("log", chunk.toString()));
    this.process.on("error", (error) => this.emit("log", `Launch failed: ${error.message}`));
    this.process.on("exit", (code, signal) => {
      this.emit("exit", { code, signal });
      this.process = null;
    });

    return {
      pid: this.process.pid,
      javaPath,
      args
    };
  }

  stop() {
    if (!this.process) return false;
    this.process.kill();
    return true;
  }

  async resolveJavaPath(instance) {
    const detector = new JavaDetector();
    const mode = String(instance?.javaMode || this.settingsStore.get("javaMode") || "recommended").toLowerCase();
    const instanceJavaPath = instance?.javaPath || "";

    if (mode === "custom" && instanceJavaPath) {
      const checked = await detector.check(instanceJavaPath);
      if (checked.ok) return checked.javaPath;
      throw new Error(checked.message);
    }

    if (mode === "current") {
      const detected = await detector.detect();
      if (detected.ok) return detected.javaPath;
      throw new Error(detected.message);
    }

    const detected = await detector.detect({ gameDir: this.settingsStore.get("gameDir") });
    if (detected.ok) return detected.javaPath;
    throw new Error(detected.message);
  }

  async resolveVersionId(instance) {
    const current = String(instance?.versionId || "").trim();
    if (current) return current;

    const manifest = await this.versionManager.getManifest();
    const firstAvailable = manifest.versions?.[0]?.id || "";
    if (firstAvailable) {
      this.emit("log", `Instance had no version set. Using ${firstAvailable}.`);
      return firstAvailable;
    }

    throw new Error("No Minecraft version is available for this instance.");
  }

  async buildArguments(instance, versionJson, nativesDir) {
    const classpath = await this.versionManager.getClasspath(versionJson);
    const separator = process.platform === "win32" ? ";" : ":";
    const replacements = await this.buildReplacements(instance, versionJson, nativesDir, classpath.join(separator));

    const jvmArgs = [];
    jvmArgs.push(`-Xmx${instance.ramMb || 2048}M`);
    jvmArgs.push(`-Xms${Math.min(512, instance.ramMb || 2048)}M`);
    if (instance.javaArgs) {
      jvmArgs.push(...splitArgs(instance.javaArgs));
    }

    if (versionJson.arguments?.jvm) {
      jvmArgs.push(...expandArguments(versionJson.arguments.jvm, replacements));
    } else {
      jvmArgs.push("-Djava.library.path=${natives_directory}");
      jvmArgs.push("-cp");
      jvmArgs.push("${classpath}");
    }

    const gameArgs = versionJson.arguments?.game
      ? expandArguments(versionJson.arguments.game, replacements)
      : expandLegacyGameArguments(versionJson.minecraftArguments || "", replacements);
    if (instance.proxyEnabled) {
      const proxy = parseProxyEndpoint(instance.proxyServer || this.settingsStore.get("proxyServer") || "127.0.0.1:8080");
      gameArgs.push("--proxyHost", proxy.host);
      gameArgs.push("--proxyPort", String(proxy.port));
      if (instance.proxyArgs || this.settingsStore.get("proxyArgs")) {
        gameArgs.push(...splitArgs(instance.proxyArgs || this.settingsStore.get("proxyArgs") || ""));
      }
    }
    if (instance.fullscreen) {
      gameArgs.push("--fullscreen");
    }
    if (instance.minecraftArgs) {
      gameArgs.push(...splitArgs(instance.minecraftArgs));
    }

    return [
      ...jvmArgs.map((arg) => replaceTokens(arg, replacements)),
      versionJson.mainClass,
      ...gameArgs.map((arg) => replaceTokens(arg, replacements))
    ];
  }

  async buildReplacements(instance, versionJson, nativesDir, classpath) {
    const username = sanitizeUsername(instance.offlineUsername || "Player");
    const uuid = offlineUuid(username);
    const gameDir = instance.minecraftDir;
    await fs.mkdir(gameDir, { recursive: true });

    return {
      auth_player_name: username,
      version_name: versionJson.id,
      game_directory: gameDir,
      assets_root: path.join(this.settingsStore.get("gameDir"), "assets"),
      assets_index_name: versionJson.assets || versionJson.assetIndex?.id || versionJson.id,
      auth_uuid: uuid,
      auth_access_token: "0",
      clientid: "",
      auth_xuid: "",
      user_type: "legacy",
      version_type: versionJson.type || "release",
      natives_directory: nativesDir,
      launcher_name: "ModelForge",
      launcher_version: "0.1.0",
      resolution_width: String(instance.windowWidth || 925),
      resolution_height: String(instance.windowHeight || 530),
      classpath,
      library_directory: path.join(this.settingsStore.get("gameDir"), "libraries"),
      classpath_separator: process.platform === "win32" ? ";" : ":",
      primary_jar: path.join(this.settingsStore.get("gameDir"), "versions", versionJson.id, `${versionJson.id}.jar`)
    };
  }
}

function expandArguments(args, replacements) {
  const expanded = [];
  for (const item of args || []) {
    if (typeof item === "string") {
      expanded.push(item);
      continue;
    }

    if (!isAllowed(item.rules)) continue;
    const values = Array.isArray(item.value) ? item.value : [item.value];
    expanded.push(...values);
  }
  return expanded.map((arg) => replaceTokens(arg, replacements));
}

function expandLegacyGameArguments(argumentString, replacements) {
  return argumentString
    .split(" ")
    .filter(Boolean)
    .map((arg) => replaceTokens(arg, replacements));
}

function splitArgs(value) {
  const matches = String(value || "").match(/"([^"]*)"|'([^']*)'|[^\s]+/g) || [];
  return matches.map((item) => item.replace(/^["']|["']$/g, ""));
}

function parseProxyEndpoint(value) {
  const text = String(value || "127.0.0.1:8080").trim() || "127.0.0.1:8080";
  const lastColon = text.lastIndexOf(":");
  if (lastColon <= 0 || lastColon === text.length - 1) {
    return { host: "127.0.0.1", port: 8080 };
  }
  const host = text.slice(0, lastColon).trim() || "127.0.0.1";
  const port = Number.parseInt(text.slice(lastColon + 1).trim(), 10);
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 8080
  };
}

function replaceTokens(value, replacements) {
  return String(value).replace(/\$\{([^}]+)\}/g, (_match, key) => {
    return replacements[key] ?? "";
  });
}

function sanitizeUsername(value) {
  return String(value || "Player").replace(/[^A-Za-z0-9_]/g, "_").slice(0, 16) || "Player";
}

function offlineUuid(username) {
  const hash = crypto.createHash("md5").update(`OfflinePlayer:${username}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20)
  ].join("-");
}

function quoteArg(arg) {
  return /\s/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

module.exports = { MinecraftLauncher };
