const path = require("path");
const { ensureDir, writeJson, readJson, pathExists } = require("./fsUtils");
const fs = require("fs/promises");

function serializeLegacyCfg(settings) {
  const lines = [
    "[Application]",
    "app.mainclass=Bootstrap",
    "app.classpath=$APPDIR/bootstrap.jar",
    "",
    "[Launcher]",
    `gameDir=${settings.gameDir || ""}`,
    `javaMode=${settings.javaMode || ""}`,
    `javaPath=${settings.javaPath || ""}`,
    `offlineUsername=${settings.offlineUsername || ""}`,
    `versionId=${settings.versionId || ""}`,
    `backgroundPath=${settings.backgroundPath || ""}`,
    `ramMb=${settings.ramMb || ""}`,
    `windowWidth=${settings.windowWidth || ""}`,
    `windowHeight=${settings.windowHeight || ""}`,
    `fullscreen=${settings.fullscreen ? "true" : "false"}`,
    `theme=${settings.theme || "dark"}`,
    `proxyEnabled=${settings.proxyEnabled ? "true" : "false"}`,
    `proxyServer=${settings.proxyServer || ""}`,
    `proxyArgs=${settings.proxyArgs || ""}`
  ];
  return `${lines.join("\n")}\n`;
}

async function writeLegacyCfg(filePath, settings) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, serializeLegacyCfg(settings), "utf8");
}

async function readLegacyCfg(filePath) {
  if (!await pathExists(filePath)) return null;
  const text = await fs.readFile(filePath, "utf8");
  const values = {};
  let section = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const sectionMatch = line.match(/^\[(.+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    values[`${section}.${key}`] = value;
  }
  return values;
}

function serializeLegacyArgs(settings) {
  const lines = [];
  if (settings.gameDir) lines.push(`--directory ${quoteValue(settings.gameDir)}`);
  if (settings.javaArgs) lines.push(`--javaargs ${quoteValue(settings.javaArgs)}`);
  if (settings.minecraftArgs) lines.push(`--margs ${quoteValue(settings.minecraftArgs)}`);
  if (settings.offlineUsername) lines.push(`--usernane ${quoteValue(settings.offlineUsername)}`);
  if (settings.versionId) lines.push(`--version ${quoteValue(settings.versionId)}`);
  if (settings.backgroundPath) lines.push(`--background ${quoteValue(settings.backgroundPath)}`);
  return `${lines.join("\n")}\n`;
}

async function writeLegacyArgs(filePath, settings) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, serializeLegacyArgs(settings), "utf8");
}

async function readLegacyArgs(filePath) {
  const resolved = await resolveLegacyPath(filePath, "args");
  if (!resolved) return null;
  const text = await fs.readFile(resolved, "utf8");
  return parseArgFile(text);
}

function serializeLegacyBootArgs(settings) {
  const lines = [];
  if (settings.javaArgs) lines.push(settings.javaArgs);
  if (settings.bootJavaArgs) lines.push(settings.bootJavaArgs);
  return `${lines.join(" ")}\n`;
}

async function writeLegacyBootArgs(filePath, settings) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, serializeLegacyBootArgs(settings), "utf8");
}

async function readLegacyBootArgs(filePath) {
  const resolved = await resolveLegacyPath(filePath, "bootargs");
  if (!resolved) return null;
  const text = await fs.readFile(resolved, "utf8");
  return text.trim();
}

async function resolveLegacyPath(filePath, kind) {
  const ext = path.extname(filePath);
  if (ext) {
    return await pathExists(filePath) ? filePath : null;
  }

  const base = path.basename(filePath);
  if (base.toLowerCase().endsWith(`.${kind}`)) {
    return await pathExists(filePath) ? filePath : null;
  }

  const candidates = legacyCandidateNames(kind).map((name) => path.join(filePath, name));
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

function legacyCandidateNames(kind) {
  const names = [`tl.${kind}`];
  if (process.platform === "darwin") {
    const osName = "macos";
    names.push(`tl-${osName}.${kind}`);
    names.push(`tl-${osName}-${process.arch}.${kind}`);
  } else if (process.platform === "win32") {
    const osName = "windows";
    names.push(`tl-${osName}.${kind}`);
    names.push(`tl-${osName}-${process.arch}.${kind}`);
  } else {
    const osName = "linux";
    names.push(`tl-${osName}.${kind}`);
    names.push(`tl-${osName}-${process.arch}.${kind}`);
  }
  return names;
}

function parseArgFile(text) {
  const values = {};
  const tokens = String(text || "").match(/"([^"]*)"|'([^']*)'|[^\s]+/g) || [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith("--")) continue;
    const key = token.replace(/^--/, "").toLowerCase();
    const valueToken = tokens[i + 1] || "";
    const value = valueToken.startsWith("--") ? "" : unquote(valueToken);
    if (!valueToken.startsWith("--")) i += 1;
    values[key] = value;
  }
  return values;
}

function quoteValue(value) {
  const text = String(value || "");
  return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function unquote(value) {
  return String(value || "").replace(/^["']|["']$/g, "");
}

function getLegacyRuntimeRoots() {
  const roots = [];
  if (process.platform === "darwin") {
    roots.push("/private/var/tmp/dih/lstable.app/Contents/runtime");
    roots.push("/private/var/tmp/dih/lstable.app/Contents/app/runtime");
  }
  if (process.resourcesPath) {
    roots.push(path.join(process.resourcesPath, "runtime"));
  }
  if (process.execPath) {
    const appRoot = path.resolve(path.dirname(process.execPath), "..");
    roots.push(path.join(appRoot, "runtime"));
    roots.push(path.join(appRoot, "Contents", "runtime"));
  }
  return roots;
}

module.exports = {
  getLegacyRuntimeRoots,
  readLegacyArgs,
  readLegacyBootArgs,
  readLegacyCfg,
  serializeLegacyCfg,
  serializeLegacyArgs,
  serializeLegacyBootArgs,
  writeLegacyArgs,
  writeLegacyBootArgs,
  writeLegacyCfg
};
