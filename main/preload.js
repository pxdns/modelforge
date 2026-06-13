const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launcherApi", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch) => ipcRenderer.invoke("settings:update", patch),
  setGameDir: (gameDir) => ipcRenderer.invoke("settings:set-game-dir", gameDir),
  selectDirectory: () => ipcRenderer.invoke("dialog:select-directory"),
  selectJava: () => ipcRenderer.invoke("dialog:select-java"),
  listVersions: (forceRefresh) => ipcRenderer.invoke("versions:list", forceRefresh),
  ensureVersion: (versionId) => ipcRenderer.invoke("versions:ensure", versionId),
  listInstances: () => ipcRenderer.invoke("instances:list"),
  createInstance: (payload) => ipcRenderer.invoke("instances:create", payload),
  updateInstance: (instanceId, patch) => ipcRenderer.invoke("instances:update", instanceId, patch),
  detectJava: () => ipcRenderer.invoke("java:detect"),
  checkJava: (javaPath) => ipcRenderer.invoke("java:check", javaPath),
  launch: (instanceId) => ipcRenderer.invoke("launch:start", instanceId),
  stop: () => ipcRenderer.invoke("launch:stop"),
  onLog: (callback) => ipcRenderer.on("launch-log", (_event, line) => callback(line)),
  onExit: (callback) => ipcRenderer.on("launch-exit", (_event, result) => callback(result)),
  onProgress: (callback) => ipcRenderer.on("download-progress", (_event, payload) => callback(payload))
});
