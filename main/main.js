const { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell } = require("electron");
const fs = require("fs/promises");
const path = require("path");
const { SettingsStore } = require("../core/settingsStore");
const { VersionManager } = require("../core/versionManager");
const { InstanceManager } = require("../core/instanceManager");
const { ModManager } = require("../core/modManager");
const { JavaDetector } = require("../core/javaDetector");
const { MinecraftLauncher } = require("../core/launcher");

const settings = new SettingsStore();
const versionManager = new VersionManager(settings);
const instanceManager = new InstanceManager(settings);
const modManager = new ModManager(settings);
const javaDetector = new JavaDetector();
let launcher = null;
const windows = new Set();

const folderMap = {
  minecraft: "",
  mods: "mods",
  resourcepacks: "resourcepacks",
  shaderpacks: "shaderpacks",
  saves: "saves",
  logs: "logs",
  screenshots: "screenshots"
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1160,
    height: 760,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: "#111318",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "../renderer/index.html"));
  windows.add(win);
  win.on("closed", () => windows.delete(win));
}

app.whenReady().then(async () => {
  await settings.init();
  await instanceManager.init();
  applyTheme(settings.get("theme"));
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function createProgressSender(event, channel) {
  return (payload) => event.sender.send(channel, payload);
}

ipcMain.handle("settings:get", async () => settings.getAll());

ipcMain.handle("settings:update", async (_event, patch) => {
  await settings.setMany(patch);
  if (patch.theme) applyTheme(patch.theme);
  return settings.getAll();
});

ipcMain.handle("settings:set-game-dir", async (_event, gameDir) => {
  await settings.setGameDir(gameDir);
  await instanceManager.init();
  return settings.getAll();
});

ipcMain.handle("dialog:select-directory", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("dialog:select-java", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "openDirectory"]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("folders:open", async (_event, folderKey, instanceId = null) => {
  const relative = folderMap[folderKey];
  if (relative === undefined) throw new Error(`Unknown folder: ${folderKey}`);
  const instance = instanceId ? await instanceManager.getInstance(instanceId) : null;
  const baseDir = instance?.minecraftDir || settings.get("gameDir");
  const target = relative ? path.join(baseDir, relative) : baseDir;
  await fs.mkdir(target, { recursive: true });
  const error = await shell.openPath(target);
  if (error) throw new Error(error);
  return target;
});

ipcMain.handle("mods:list", async (_event, instanceId = null) => {
  const instance = instanceId ? await instanceManager.getInstance(instanceId) : null;
  return modManager.listMods(instance || {
    minecraftDir: settings.get("gameDir"),
    versionId: "",
    loader: "Vanilla"
  });
});

ipcMain.handle("mods:add", async (_event, instanceId = null) => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Minecraft Mods", extensions: ["jar"] }]
  });
  if (result.canceled) return [];
  const instance = instanceId ? await instanceManager.getInstance(instanceId) : null;
  const modsDir = path.join(instance?.minecraftDir || settings.get("gameDir"), "mods");
  await fs.mkdir(modsDir, { recursive: true });
  for (const filePath of result.filePaths) {
    await fs.copyFile(filePath, path.join(modsDir, path.basename(filePath)));
  }
  return result.filePaths;
});

ipcMain.handle("mods:delete", async (_event, modPath) => {
  const target = path.resolve(modPath);
  const roots = [
    path.resolve(settings.get("gameDir")),
    path.resolve(settings.get("instancesDir") || path.join(process.cwd(), "instances"))
  ];
  if (!roots.some((root) => target.startsWith(`${root}${path.sep}`) || target === root)) {
    throw new Error("Refusing to delete a file outside the launcher folders.");
  }
  await fs.rm(target, { force: true });
  return true;
});

ipcMain.handle("logs:copy", async (_event, text) => {
  clipboard.writeText(text || "");
  return true;
});

ipcMain.handle("logs:export", async (_event, text) => {
  const result = await dialog.showSaveDialog({
    defaultPath: "modelforge-launcher.log",
    filters: [{ name: "Log files", extensions: ["log", "txt"] }]
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, text || "", "utf8");
  return result.filePath;
});

ipcMain.handle("versions:list", async (event, forceRefresh = false) => {
  return versionManager.getManifest({
    forceRefresh,
    onProgress: createProgressSender(event, "download-progress")
  });
});

ipcMain.handle("versions:ensure", async (event, versionId) => {
  return versionManager.ensureVersion(versionId, {
    onProgress: createProgressSender(event, "download-progress")
  });
});

ipcMain.handle("instances:list", async () => instanceManager.listInstances());

ipcMain.handle("instances:create", async (_event, payload) => {
  return instanceManager.createInstance(payload);
});

ipcMain.handle("instances:update", async (_event, instanceId, patch) => {
  return instanceManager.updateInstance(instanceId, patch);
});

ipcMain.handle("java:detect", async () => javaDetector.detect({ gameDir: settings.get("gameDir") }));

ipcMain.handle("java:check", async (_event, javaPath) => javaDetector.check(javaPath));

ipcMain.handle("launch:start", async (event, instanceId) => {
  const instance = await instanceManager.getInstance(instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);

  launcher = new MinecraftLauncher(settings, versionManager, modManager);
  launcher.on("log", (line) => event.sender.send("launch-log", line));
  launcher.on("exit", (result) => event.sender.send("launch-exit", result));
  launcher.on("progress", (payload) => event.sender.send("download-progress", payload));

  const launchInfo = await launcher.launch(instance);
  return launchInfo;
});

ipcMain.handle("launch:stop", async () => {
  if (!launcher) return false;
  return launcher.stop();
});

function applyTheme(theme) {
  nativeTheme.themeSource = theme === "light" ? "light" : "dark";
  const backgroundColor = theme === "light" ? "#f4f6f8" : "#0f1115";
  for (const win of windows) {
    try {
      win.setBackgroundColor(backgroundColor);
    } catch {
      // Window may be in teardown.
    }
  }
}
