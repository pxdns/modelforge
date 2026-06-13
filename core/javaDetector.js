const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");

class JavaDetector {
  async detect() {
    const candidates = await this.getCandidates();
    for (const candidate of candidates) {
      const result = await this.getVersion(candidate);
      if (result.ok) return { javaPath: candidate, ...result };
    }
    return { javaPath: "", ok: false, version: "", message: "Java was not found on PATH or common install locations." };
  }

  async getCandidates() {
    const candidates = [];
    const executable = process.platform === "win32" ? "java.exe" : "java";

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
