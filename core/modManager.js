const fs = require("fs/promises");
const path = require("path");
const { ensureDir, pathExists } = require("./fsUtils");
const { readZipEntryText } = require("./zipUtils");

class ModManager {
  constructor(settingsStore) {
    this.settingsStore = settingsStore;
  }

  getModDirs(instance) {
    const root = instance.minecraftDir;
    return {
      active: path.join(root, "mods"),
      disabled: path.join(root, "disabled-mods")
    };
  }

  async listMods(instance) {
    const { active, disabled } = this.getModDirs(instance);
    await ensureDir(active);
    await ensureDir(disabled);

    const [enabledMods, disabledMods] = await Promise.all([
      this.scanDir(active, true, instance),
      this.scanDir(disabled, false, instance)
    ]);

    return [...enabledMods, ...disabledMods].sort((a, b) => a.filename.localeCompare(b.filename));
  }

  async quarantineIncompatibleMods(instance, versionJson) {
    const { active, disabled } = this.getModDirs(instance);
    await ensureDir(active);
    await ensureDir(disabled);

    const mods = await this.scanDir(active, true, instance);
    const moved = [];

    for (const mod of mods) {
      const result = this.evaluateMod(mod, instance, versionJson);
      if (!result.incompatible) continue;
      const destination = await this.moveToDisabled(mod.path, disabled);
      moved.push({
        ...mod,
        path: destination,
        status: "Disabled",
        reason: result.reason
      });
    }

    return moved;
  }

  async scanDir(dir, enabled, instance) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const mods = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".jar")) continue;
      const filePath = path.join(dir, entry.name);
      const info = await this.inspectMod(filePath, instance);
      mods.push({
        filename: entry.name,
        name: info.name || entry.name.replace(/\.jar$/i, ""),
        version: info.version || "",
        loader: info.loader || "unknown",
        status: enabled ? "Enabled" : "Disabled",
        path: filePath,
        modId: info.id || "",
        metadata: info.metadata || null
      });
    }
    return mods;
  }

  async inspectMod(filePath, instance) {
    try {
      const fabricText = await readZipEntryText(filePath, ["fabric.mod.json"]);
      if (fabricText) {
        const metadata = JSON.parse(fabricText);
        return {
          id: metadata.id || "",
          name: metadata.name || metadata.id || path.basename(filePath),
          version: metadata.version || "",
          loader: this.detectFabricLoader(metadata),
          metadata
        };
      }

      const tomlText = await readZipEntryText(filePath, ["META-INF/mods.toml", "META-INF/MODS.toml"]);
      if (tomlText) {
        const metadata = parseTomlMetadata(tomlText);
        return {
          id: metadata.modId || "",
          name: metadata.displayName || metadata.modId || path.basename(filePath),
          version: metadata.version || "",
          loader: metadata.loader || "forge",
          metadata
        };
      }
    } catch {
      // Fall through to unknown.
    }

    return {
      id: "",
      name: path.basename(filePath, ".jar"),
      version: "",
      loader: "unknown",
      metadata: null
    };
  }

  detectFabricLoader(metadata) {
    const env = String(metadata.environment || "*").toLowerCase();
    if (env === "client" || env === "server") return "fabric";
    return "fabric";
  }

  evaluateMod(mod, instance, versionJson) {
    const loader = normalizeLoader(instance.loader || this.settingsStore.get("loader") || "vanilla");
    const modLoader = normalizeLoader(mod.loader);
    const versionId = resolveMinecraftVersionId(versionJson, instance);

    if (loader === "vanilla") {
      if (modLoader !== "unknown") {
        return { incompatible: true, reason: "Vanilla profiles cannot load mods" };
      }
      return { incompatible: false, reason: "" };
    }

    if (loader === "fabric") {
      if (modLoader === "forge" || modLoader === "neoforge" || modLoader === "quilt") {
        return { incompatible: true, reason: "Not compatible with Fabric" };
      }
      if (mod.metadata?.depends?.minecraft && !matchesMinecraftRange(mod.metadata.depends.minecraft, versionId)) {
        return { incompatible: true, reason: "Minecraft version mismatch" };
      }
      return { incompatible: false, reason: "" };
    }

    if (loader === "quilt") {
      if (modLoader === "forge" || modLoader === "neoforge") {
        return { incompatible: true, reason: "Not compatible with Quilt" };
      }
      return { incompatible: false, reason: "" };
    }

    if (loader === "forge" || loader === "neoforge") {
      if (modLoader === "fabric") {
        return { incompatible: true, reason: `Not compatible with ${loader}` };
      }
      return { incompatible: false, reason: "" };
    }

    return { incompatible: false, reason: "" };
  }

  async moveToDisabled(sourcePath, disabledDir) {
    await ensureDir(disabledDir);
    let destination = path.join(disabledDir, path.basename(sourcePath));
    let index = 1;
    while (await pathExists(destination)) {
      const { name, ext } = path.parse(path.basename(sourcePath));
      destination = path.join(disabledDir, `${name}-${index}${ext}`);
      index += 1;
    }
    await fs.rename(sourcePath, destination);
    return destination;
  }
}

function normalizeLoader(value) {
  const loader = String(value || "unknown").toLowerCase();
  if (loader.includes("neo")) return "neoforge";
  if (loader.includes("javafml") || loader.includes("fml") || loader.includes("forge")) return "forge";
  if (loader.includes("quilt")) return "quilt";
  if (loader.includes("fabric")) return "fabric";
  if (loader.includes("vanilla")) return "vanilla";
  return "unknown";
}

function parseTomlMetadata(text) {
  const modId = text.match(/modId\s*=\s*"([^"]+)"/i)?.[1] || "";
  const version = text.match(/version\s*=\s*"([^"]+)"/i)?.[1] || "";
  const displayName = text.match(/displayName\s*=\s*"([^"]+)"/i)?.[1] || modId;
  const loader = /modLoader\s*=\s*"([^"]+)"/i.test(text)
    ? (text.match(/modLoader\s*=\s*"([^"]+)"/i)?.[1] || "forge")
    : "forge";
  return { modId, version, displayName, loader };
}

function matchesMinecraftRange(range, version) {
  const text = String(range || "").trim();
  if (!text || !version) return true;
  const parts = text.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    const token = part.replace(/["']/g, "");
    if (/^[<>!=]/.test(token)) {
      if (!compareRangeToken(version, token)) return false;
      continue;
    }
    if (token === "*") continue;
    if (token.replace(/-$/, "") !== version && !version.startsWith(token.replace(/-$/, ""))) {
      return false;
    }
  }
  return true;
}

function compareRangeToken(version, token) {
  const match = token.match(/^(<=|>=|<|>|=)?\s*(.+)$/);
  if (!match) return true;
  const op = match[1] || "=";
  const target = match[2].replace(/-$/, "");
  const compare = compareVersions(version, target);
  if (op === "=") return compare === 0;
  if (op === "<") return compare < 0;
  if (op === "<=") return compare <= 0;
  if (op === ">") return compare > 0;
  if (op === ">=") return compare >= 0;
  return true;
}

function compareVersions(a, b) {
  const left = String(a).split(/[.-]/).map(Number);
  const right = String(b).split(/[.-]/).map(Number);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const l = Number.isFinite(left[i]) ? left[i] : 0;
    const r = Number.isFinite(right[i]) ? right[i] : 0;
    if (l !== r) return l - r;
  }
  return 0;
}

function resolveMinecraftVersionId(versionJson, instance) {
  const candidates = [
    versionJson?.jar,
    versionJson?.inheritsFrom,
    versionJson?.releaseTarget,
    versionJson?.baseVersion,
    versionJson?.minecraftVersion
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) return value;
  }

  const raw = String(versionJson?.id || instance?.versionId || "").trim();
  const match = raw.match(/\b\d+(?:\.\d+)+\b/);
  if (match) return match[0];
  return raw;
}

module.exports = { ModManager };
