const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const { SettingsStore } = require("../core/settingsStore");
const { VersionManager } = require("../core/versionManager");
const { InstanceManager } = require("../core/instanceManager");
const { JavaDetector } = require("../core/javaDetector");
const { MinecraftLauncher } = require("../core/launcher");

const settings = new SettingsStore();
const versionManager = new VersionManager(settings);
const instanceManager = new InstanceManager(settings);
const javaDetector = new JavaDetector();
let launcher = null;

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
}

app.whenReady().then(async () => {
  await settings.init();
  await instanceManager.init();
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
    properties: ["openFile"]
  });
  return result.canceled ? null : result.filePaths[0];
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

ipcMain.handle("java:detect", async () => javaDetector.detect());

ipcMain.handle("launch:start", async (event, instanceId) => {
  const instance = await instanceManager.getInstance(instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);

  launcher = new MinecraftLauncher(settings, versionManager);
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
