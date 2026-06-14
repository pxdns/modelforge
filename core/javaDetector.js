const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { getLegacyRuntimeRoots } = require("./legacyCompat");

class JavaDetector {
  async detect(options = {}) {
    const candidates = await this.getCandidates(options);
    for (const candidate of candidates) {
      const result = await this.check(candidate);
      if (result.ok) return { javaPath: candidate, ...result };
    }
    return { javaPath: "", ok: false, version: "", message: "Java was not found on PATH or common install locations." };
  }

  async check(inputPath) {
    if (!inputPath) {
      return { ok: false, javaPath: "", version: "", message: "No Java path was provided." };
    }

    const javaPath = await this.resolveJavaExecutable(inputPath);
    if (!javaPath) {
      return {
        ok: false,
        javaPath: "",
        version: "",
        message: `No Java executable was found in ${inputPath}.`
      };
    }

    const result = await this.getVersion(javaPath);
    return { ...result, javaPath };
  }

  async resolveJavaExecutable(inputPath) {
    const executable = process.platform === "win32" ? "java.exe" : "java";
    const value = String(inputPath).trim();
    if (!value) return "";

    if (!value.includes("/") && !value.includes("\\")) return value;

    let stat = null;
    try {
      stat = await fs.stat(value);
    } catch {
      return "";
    }

    if (stat.isFile()) return value;
    if (!stat.isDirectory()) return "";

    const candidates = [
      path.join(value, "bin", executable),
      path.join(value, "Contents", "Home", "bin", executable),
      path.join(value, "Home", "bin", executable)
    ];

    for (const candidate of candidates) {
      try {
        const candidateStat = await fs.stat(candidate);
        if (candidateStat.isFile()) return candidate;
      } catch {
        // Try the next known Java layout.
      }
    }

    return "";
  }

  async getCandidates(options = {}) {
    const gameDir = options.gameDir || "";
    const runtimeRoots = [];
    if (Array.isArray(options.runtimeRoots)) {
      runtimeRoots.push(...options.runtimeRoots.filter(Boolean));
    }
    if (options.runtimeRoot) runtimeRoots.push(options.runtimeRoot);
    runtimeRoots.push(...this.getDefaultRuntimeRoots(), ...getLegacyRuntimeRoots());

    const candidates = [];
    const executable = process.platform === "win32" ? "java.exe" : "java";

    for (const root of runtimeRoots) {
      candidates.push(...await this.getBundledRuntimeCandidates(root));
    }
    if (gameDir) {
      candidates.push(...await this.getBundledCandidates(gameDir));
    }
    if (process.env.JAVA_HOME) {
      candidates.push(path.join(process.env.JAVA_HOME, "bin", executable));
    }
    candidates.push(executable);

    if (process.platform === "darwin") {
      candidates.push("/usr/bin/java");
      await this.addFromDir(candidates, "/Library/Java/JavaVirtualMachines", "Contents/Home/bin/java");
    }

    if (process.platform === "win32") {
      const roots = [
        process.env.ProgramFiles,
        process.env["ProgramFiles(x86)"]
      ].filter(Boolean);
      for (const root of roots) {
        await this.addFromDir(candidates, path.join(root, "Java"), "bin/java.exe");
        await this.addFromDir(candidates, path.join(root, "Eclipse Adoptium"), "bin/java.exe");
      }
    }

    return [...new Set(candidates)];
  }

  async getBundledRuntimeCandidates(root) {
    const candidates = [];
    const executable = process.platform === "win32" ? "java.exe" : "java";
    const roots = [
      path.join(root, "Contents", "runtime", "Contents", "Home", "bin", executable),
      path.join(root, "runtime", "Contents", "Home", "bin", executable),
      path.join(root, "Contents", "runtime", "Home", "bin", executable),
      path.join(root, "Contents", "runtime", "bin", executable),
      path.join(root, "runtime", "bin", executable)
    ];

    for (const candidate of roots) {
      candidates.push(candidate);
    }

    return candidates;
  }

  getDefaultRuntimeRoots() {
    const roots = [];
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

  async getBundledCandidates(gameDir) {
    const root = path.join(gameDir, "mojang_jre");
    const candidates = [];
    const seen = new Set();

    await this.walkJavaCandidates(root, candidates, seen, 0, 7);
    return candidates;
  }

  async walkJavaCandidates(dir, candidates, seen, depth, maxDepth) {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile()) {
        if ((process.platform === "win32" && entry.name.toLowerCase() === "java.exe") || (!entry.name.toLowerCase().endsWith(".exe") && entry.name === "java")) {
          if (!seen.has(fullPath)) {
            seen.add(fullPath);
            candidates.push(fullPath);
          }
        }
        continue;
      }

      await this.walkJavaCandidates(fullPath, candidates, seen, depth + 1, maxDepth);
    }
  }

  async addFromDir(candidates, root, suffix) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) candidates.push(path.join(root, entry.name, suffix));
      }
    } catch {
      // Common installation directories are optional.
    }
  }

  getVersion(javaPath) {
    return new Promise((resolve) => {
      const child = execFile(javaPath, ["-version"], { timeout: 5000 }, (error, _stdout, stderr) => {
        if (error) {
          resolve({ ok: false, version: "", message: error.message });
          return;
        }
        const output = stderr.toString();
        const version = output.match(/version "([^"]+)"/)?.[1] || output.split("\n")[0] || "";
        resolve({ ok: true, version, message: output.trim() });
      });
      child.stdin?.end();
    });
  }
}

module.exports = { JavaDetector };
