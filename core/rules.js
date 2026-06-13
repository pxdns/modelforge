const os = require("os");

function currentOsName() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "osx";
  return "linux";
}

function osArch() {
  const arch = os.arch();
  if (arch === "x64") return "x64";
  if (arch === "arm64") return "arm64";
  return arch;
}

function ruleMatches(rule, features = {}) {
  if (rule.features) {
    for (const [key, value] of Object.entries(rule.features)) {
      if (features[key] !== value) return false;
    }
  }
  if (!rule.os) return true;
  if (rule.os.name && rule.os.name !== currentOsName()) return false;
  if (rule.os.arch && rule.os.arch !== osArch()) return false;
  if (rule.os.version && !(new RegExp(rule.os.version).test(os.release()))) return false;
  return true;
}

function isAllowed(rules, features = {}) {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    if (ruleMatches(rule, features)) allowed = rule.action === "allow";
  }
  return allowed;
}

module.exports = {
  currentOsName,
  isAllowed,
  osArch
};
