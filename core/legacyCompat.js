const path = require("path");
const { ensureDir, writeJson, readJson, pathExists } = require("./fsUtils");

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
    `ramMb=${settings.ramMb || ""}`,
    `windowWidth=${settings.windowWidth || ""}`,
    `windowHeight=${settings.windowHeight || ""}`,
    `fullscreen=${settings.fullscreen ? "true" : "false"}`,
    `theme=${settings.theme || "dark"}`
  ];
  return `${lines.join("\n")}\n`;
}

async function writeLegacyCfg(filePath, settings) {
  await ensureDir(path.dirname(filePath));
  await require("fs/promises").writeFile(filePath, serializeLegacyCfg(settings), "utf8");
}

async function readLegacyCfg(filePath) {
  if (!await pathExists(filePath)) return null;
  const text = await require("fs/promises").readFile(filePath, "utf8");
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
  readLegacyCfg,
  serializeLegacyCfg,
  writeLegacyCfg
};
