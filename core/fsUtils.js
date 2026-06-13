const fs = require("fs/promises");
const path = require("path");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== null) return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sanitizeName(name) {
  return String(name || "instance")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "instance";
}

module.exports = {
  ensureDir,
  pathExists,
  readJson,
  sanitizeName,
  writeJson
};
