const os = require("os");
const path = require("path");

function defaultMinecraftDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || os.homedir(), ".minecraft");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "minecraft");
  }
  return path.join(os.homedir(), ".minecraft");
}

function defaultLauncherDir() {
  return path.join(os.homedir(), ".minecraft-lite-launcher");
}

module.exports = {
  defaultLauncherDir,
  defaultMinecraftDir
};
