const DEFAULTS = {
  separateFoldersMode: "none",
  ramMb: 4096,
  autoMemory: true,
  javaMode: "recommended",
  javaPath: "",
  javaArgs: "",
  minecraftArgs: "",
  wrapperCommand: "",
  updateSslCertificates: true,
  improvedJvmArguments: "default",
  windowWidth: 925,
  windowHeight: 530,
  fullscreen: false,
  delayedStart: false,
  forceUpdate: false,
  versionFilters: {
    release: true,
    remote: true,
    modified: true,
    fabric: true,
    forge: true,
    neoForge: true,
    quilt: true,
    alpha: false,
    experimental: true,
    installedOnly: false,
    snapshots: true,
    beta: false,
    launchers: false,
    oldReleases: true
  },
  suggestServers: false,
  theme: "dark"
};

const state = {
  settings: null,
  versions: [],
  instances: [],
  selectedInstance: null,
  launching: false,
  detectedJava: null,
  progressState: new Map()
};

const $ = (selector) => document.querySelector(selector);

const el = {
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  themeToggle: $("#themeToggle"),
  gameDirInput: $("#gameDirInput"),
  selectGameDirButton: $("#selectGameDirButton"),
  separateFoldersSelect: $("#separateFoldersSelect"),
  windowWidthInput: $("#windowWidthInput"),
  windowHeightInput: $("#windowHeightInput"),
  fullscreenCheckbox: $("#fullscreenCheckbox"),
  delayedStartCheckbox: $("#delayedStartCheckbox"),
  forceUpdateCheckbox: $("#forceUpdateCheckbox"),
  filterRemote: $("#filterRemote"),
  filterModified: $("#filterModified"),
  filterFabric: $("#filterFabric"),
  filterForge: $("#filterForge"),
  filterNeoForge: $("#filterNeoForge"),
  filterQuilt: $("#filterQuilt"),
  filterAlpha: $("#filterAlpha"),
  filterExperimental: $("#filterExperimental"),
  filterInstalledOnly: $("#filterInstalledOnly"),
  filterSnapshots: $("#filterSnapshots"),
  filterBeta: $("#filterBeta"),
  filterLaunchers: $("#filterLaunchers"),
  filterOldReleases: $("#filterOldReleases"),
  javaModeSelect: $("#javaModeSelect"),
  openJavaSettingsButton: $("#openJavaSettingsButton"),
  ramSlider: $("#ramSlider"),
  ramNumberInput: $("#ramNumberInput"),
  autoMemoryCheckbox: $("#autoMemoryCheckbox"),
  suggestServersCheckbox: $("#suggestServersCheckbox"),
  saveSettingsButton: $("#saveSettingsButton"),
  resetSettingsButton: $("#resetSettingsButton"),
  homeButton: $("#homeButton"),
  createInstanceButton: $("#createInstanceButton"),
  instanceSelect: $("#instanceSelect"),
  selectedTitle: $("#selectedTitle"),
  selectedSubtitle: $("#selectedSubtitle"),
  refreshVersionsButton: $("#refreshVersionsButton"),
  instanceForm: $("#instanceForm"),
  instanceNameInput: $("#instanceNameInput"),
  usernameInput: $("#usernameInput"),
  versionSelect: $("#versionSelect"),
  loaderSelect: $("#loaderSelect"),
  javaPathInput: $("#javaPathInput"),
  selectJavaButton: $("#selectJavaButton"),
  detectJavaButton: $("#detectJavaButton"),
  playButton: $("#playButton"),
  stopButton: $("#stopButton"),
  progressLabel: $("#progressLabel"),
  progressPercent: $("#progressPercent"),
  downloadProgress: $("#downloadProgress"),
  clearConsoleButton: $("#clearConsoleButton"),
  logConsole: $("#logConsole"),
  javaDialog: $("#javaDialog"),
  dialogJavaPathInput: $("#dialogJavaPathInput"),
  dialogBrowseJavaButton: $("#dialogBrowseJavaButton"),
  detectedJavaLabel: $("#detectedJavaLabel"),
  javaArgsInput: $("#javaArgsInput"),
  updateSslCheckbox: $("#updateSslCheckbox"),
  improvedJvmSelect: $("#improvedJvmSelect"),
  minecraftArgsInput: $("#minecraftArgsInput"),
  wrapperCommandInput: $("#wrapperCommandInput"),
  doneJavaButton: $("#doneJavaButton"),
  versionTableBody: $("#versionTableBody"),
  refreshVersionsButtonSecondary: $("#refreshVersionsButtonSecondary"),
  addModButton: $("#addModButton"),
  refreshModsButton: $("#refreshModsButton"),
  modsTableBody: $("#modsTableBody"),
  logSearchInput: $("#logSearchInput"),
  copyLogsButton: $("#copyLogsButton"),
  exportLogsButton: $("#exportLogsButton"),
  javaArchLabel: $("#javaArchLabel"),
  javaVendorLabel: $("#javaVendorLabel"),
  playCallout: $("#playCallout"),
  selectedInstanceName: $("#selectedInstanceName"),
  selectedInstanceVersion: $("#selectedInstanceVersion"),
  selectedInstanceLoader: $("#selectedInstanceLoader"),
  selectedInstanceRam: $("#selectedInstanceRam"),
  selectedInstanceJava: $("#selectedInstanceJava"),
  selectedInstanceFolder: $("#selectedInstanceFolder")
};

async function boot() {
  wireEvents();
  state.settings = normalizeSettings(await window.launcherApi.getSettings());
  applyTheme();
  renderSettings();
  await loadVersions(false);
  await loadInstances();
  await detectJava(true);
  appendLog("ModelForge ready.");
}

function wireEvents() {
  el.tabs.forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
  el.themeToggle.addEventListener("click", toggleTheme);
  el.selectGameDirButton.addEventListener("click", selectGameDir);
  el.saveSettingsButton.addEventListener("click", saveSettings);
  el.resetSettingsButton.addEventListener("click", resetSettings);
  el.homeButton.addEventListener("click", () => showView("playView"));
  el.ramSlider.addEventListener("input", () => syncRam("slider"));
  el.ramNumberInput.addEventListener("input", () => syncRam("number"));
  el.openJavaSettingsButton.addEventListener("click", openJavaDialog);
  el.dialogBrowseJavaButton.addEventListener("click", selectJavaForDialog);
  el.doneJavaButton.addEventListener("click", closeJavaDialog);
  el.createInstanceButton.addEventListener("click", createInstance);
  el.refreshVersionsButton.addEventListener("click", async () => loadVersions(true));
  el.refreshVersionsButtonSecondary.addEventListener("click", async () => loadVersions(true));
  el.instanceSelect.addEventListener("change", selectInstanceFromDropdown);
  document.querySelectorAll("[data-folder]").forEach((button) => {
    button.addEventListener("click", () => openFolder(button.dataset.folder));
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.viewTarget));
  });
  el.addModButton.addEventListener("click", addMods);
  el.refreshModsButton.addEventListener("click", loadMods);
  el.copyLogsButton.addEventListener("click", copyLogs);
  el.exportLogsButton.addEventListener("click", exportLogs);
  el.logSearchInput.addEventListener("input", renderLogSearch);
  el.instanceForm.addEventListener("submit", saveSelectedInstance);
  el.selectJavaButton.addEventListener("click", selectJava);
  el.detectJavaButton.addEventListener("click", () => detectJava(false));
  el.playButton.addEventListener("click", playSelectedInstance);
  el.stopButton.addEventListener("click", stopLaunch);
  el.clearConsoleButton.addEventListener("click", () => {
    el.logConsole.textContent = "";
  });

  window.launcherApi.onLog((line) => appendLog(line));
  window.launcherApi.onExit((result) => {
    state.launching = false;
    el.playButton.disabled = !state.selectedInstance;
    el.stopButton.disabled = true;
    appendLog(`Process exited with code ${result.code ?? "null"} signal ${result.signal ?? "null"}`);
  });
  window.launcherApi.onProgress(updateProgress);
}

function normalizeSettings(settings) {
  return {
    ...DEFAULTS,
    ...settings,
    versionFilters: {
      ...DEFAULTS.versionFilters,
      ...(settings.versionFilters || {})
    }
  };
}

function showView(id) {
  el.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === id));
  el.views.forEach((view) => view.classList.toggle("active", view.id === id));
}

async function toggleTheme() {
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
  applyTheme();
  await window.launcherApi.updateSettings({ theme: state.settings.theme });
}

function applyTheme() {
  document.body.classList.toggle("light", state.settings.theme === "light");
  document.body.classList.toggle("dark", state.settings.theme !== "light");
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.style.colorScheme = state.settings.theme === "light" ? "light" : "dark";
  el.themeToggle.textContent = state.settings.theme === "light" ? "Switch to dark" : "Switch to light";
}

function renderSettings() {
  const settings = state.settings;
  el.gameDirInput.value = settings.gameDir || "";
  el.separateFoldersSelect.value = settings.separateFoldersMode;
  el.windowWidthInput.value = settings.windowWidth;
  el.windowHeightInput.value = settings.windowHeight;
  el.fullscreenCheckbox.checked = settings.fullscreen;
  el.delayedStartCheckbox.checked = settings.delayedStart;
  el.forceUpdateCheckbox.checked = settings.forceUpdate;
  el.filterRemote.checked = settings.versionFilters.release ?? settings.versionFilters.remote;
  el.filterModified.checked = settings.versionFilters.modified;
  el.filterFabric.checked = settings.versionFilters.fabric;
  el.filterForge.checked = settings.versionFilters.forge;
  el.filterNeoForge.checked = settings.versionFilters.neoForge;
  el.filterQuilt.checked = settings.versionFilters.quilt;
  el.filterAlpha.checked = settings.versionFilters.alpha;
  el.filterExperimental.checked = settings.versionFilters.experimental;
  el.filterInstalledOnly.checked = settings.versionFilters.installedOnly;
  el.filterSnapshots.checked = settings.versionFilters.snapshots;
  el.filterBeta.checked = settings.versionFilters.beta;
  el.filterLaunchers.checked = settings.versionFilters.launchers;
  el.filterOldReleases.checked = settings.versionFilters.oldReleases;
  el.javaModeSelect.value = settings.javaMode;
  el.ramSlider.value = settings.ramMb;
  el.ramNumberInput.value = settings.ramMb;
  el.autoMemoryCheckbox.checked = settings.autoMemory;
  el.suggestServersCheckbox.checked = settings.suggestServers;
  el.javaPathInput.value = settings.javaPath || "";
  el.dialogJavaPathInput.value = settings.javaPath || "";
  el.javaArgsInput.value = settings.javaArgs || "";
  el.updateSslCheckbox.checked = settings.updateSslCertificates;
  el.improvedJvmSelect.value = settings.improvedJvmArguments;
  el.minecraftArgsInput.value = settings.minecraftArgs || "";
  el.wrapperCommandInput.value = settings.wrapperCommand || "";
}

function collectSettings() {
  return normalizeSettings({
    ...state.settings,
    gameDir: el.gameDirInput.value.trim(),
    separateFoldersMode: el.separateFoldersSelect.value,
    windowWidth: Number(el.windowWidthInput.value || 925),
    windowHeight: Number(el.windowHeightInput.value || 530),
    fullscreen: el.fullscreenCheckbox.checked,
    delayedStart: el.delayedStartCheckbox.checked,
    forceUpdate: el.forceUpdateCheckbox.checked,
    versionFilters: {
      release: el.filterRemote.checked,
      remote: el.filterRemote.checked,
      modified: el.filterModified.checked,
      fabric: el.filterFabric.checked,
      forge: el.filterForge.checked,
      neoForge: el.filterNeoForge.checked,
      quilt: el.filterQuilt.checked,
      alpha: el.filterAlpha.checked,
      experimental: el.filterExperimental.checked,
      installedOnly: el.filterInstalledOnly.checked,
      snapshots: el.filterSnapshots.checked,
      beta: el.filterBeta.checked,
      launchers: el.filterLaunchers.checked,
      oldReleases: el.filterOldReleases.checked
    },
    javaMode: el.javaModeSelect.value,
    javaPath: el.javaPathInput.value.trim() || el.dialogJavaPathInput.value.trim(),
    javaArgs: el.javaArgsInput.value.trim(),
    minecraftArgs: el.minecraftArgsInput.value.trim(),
    wrapperCommand: el.wrapperCommandInput.value.trim(),
    updateSslCertificates: el.updateSslCheckbox.checked,
    improvedJvmArguments: el.improvedJvmSelect.value,
    ramMb: Number(el.ramNumberInput.value || 4096),
    autoMemory: el.autoMemoryCheckbox.checked,
    suggestServers: el.suggestServersCheckbox.checked
  });
}

async function saveSettings() {
  state.settings = collectSettings();
  await window.launcherApi.updateSettings(state.settings);
  await loadInstances();
  appendLog("Settings saved.");
}

async function resetSettings() {
  state.settings = normalizeSettings({ ...state.settings, ...DEFAULTS });
  renderSettings();
  await saveSettings();
}

function syncRam(source) {
  if (source === "slider") el.ramNumberInput.value = el.ramSlider.value;
  if (source === "number") el.ramSlider.value = el.ramNumberInput.value;
}

async function selectGameDir() {
  const gameDir = await window.launcherApi.selectDirectory();
  if (!gameDir) return;
  el.gameDirInput.value = gameDir;
  state.settings.gameDir = gameDir;
  await saveSettings();
  await loadVersions(false);
}

function openJavaDialog() {
  el.dialogJavaPathInput.value = el.javaPathInput.value.trim() || state.settings.javaPath || "";
  document.querySelector(`input[name="javaChoice"][value="${el.javaModeSelect.value}"]`).checked = true;
  el.javaDialog.showModal();
}

async function closeJavaDialog() {
  const selected = document.querySelector('input[name="javaChoice"]:checked')?.value || "custom";
  if (selected === "custom" && el.dialogJavaPathInput.value.trim()) {
    const ok = await checkAndApplyJavaPath(el.dialogJavaPathInput.value.trim(), false);
    if (!ok) return;
  }
  el.javaModeSelect.value = selected;
  el.javaPathInput.value = el.dialogJavaPathInput.value.trim();
  await saveSettings();
  el.javaDialog.close();
}

async function selectJavaForDialog() {
  const javaPath = await window.launcherApi.selectJava();
  if (javaPath) {
    await checkAndApplyJavaPath(javaPath, false);
  }
}

async function loadVersions(forceRefresh) {
  try {
    appendLog(forceRefresh ? "Refreshing version index..." : "Loading versions...");
    const manifest = await window.launcherApi.listVersions(forceRefresh);
    state.versions = filterVersions(manifest.versions || []);
    renderVersions();
    renderVersionTable();
    appendLog(`Loaded ${state.versions.length} versions.`);
  } catch (error) {
    const message = "Minecraft versions are unavailable right now. Using cached data when possible.";
    appendLog(message);
    if (forceRefresh) {
      el.progressLabel.textContent = "Version refresh unavailable";
    }
    console.warn("Version load failed", error);
  }
}

function filterVersions(versions) {
  const filters = state.settings.versionFilters;
  return versions.filter((version) => {
    if (version.type === "release") return filters.release ?? filters.remote;
    if (version.type === "snapshot") return filters.snapshots;
    if (version.type === "old_beta") return filters.beta;
    if (version.type === "old_alpha") return filters.alpha;
    return true;
  });
}

async function loadInstances() {
  state.instances = await window.launcherApi.listInstances();
  if (state.selectedInstance) {
    state.selectedInstance = state.instances.find((instance) => instance.id === state.selectedInstance.id) || null;
  }
  if (!state.selectedInstance && state.instances.length > 0) {
    state.selectedInstance = state.instances[0];
  }
  renderInstances();
  renderSelectedInstance();
  await loadMods();
}

function renderVersions() {
  el.versionSelect.innerHTML = "";
  for (const version of state.versions) {
    const option = document.createElement("option");
    option.value = version.id;
    option.textContent = version.id;
    el.versionSelect.append(option);
  }
}

function renderInstances() {
  el.instanceSelect.innerHTML = "";
  if (state.instances.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No instances";
    el.instanceSelect.append(option);
    return;
  }

  for (const instance of state.instances) {
    const option = document.createElement("option");
    option.value = instance.id;
    option.textContent = `${instance.name} (${instance.versionId || "No version"})`;
    el.instanceSelect.append(option);
  }
  if (state.selectedInstance) el.instanceSelect.value = state.selectedInstance.id;
}

async function selectInstanceFromDropdown() {
  state.selectedInstance = state.instances.find((instance) => instance.id === el.instanceSelect.value) || null;
  renderSelectedInstance();
  await loadMods();
}

function renderSelectedInstance() {
  const instance = state.selectedInstance;
  el.playButton.disabled = !instance || state.launching;
  if (!instance) {
    el.selectedTitle.textContent = "Select an instance";
    el.selectedSubtitle.textContent = "Choose an instance to configure and launch.";
    el.playCallout.textContent = "Create or choose an instance to get started.";
    el.selectedInstanceName.textContent = "None";
    el.selectedInstanceVersion.textContent = "-";
    el.selectedInstanceLoader.textContent = "Vanilla";
    el.selectedInstanceRam.textContent = `${state.settings.ramMb || 4096} MiB`;
    el.selectedInstanceJava.textContent = state.settings.javaPath ? "Custom" : "Auto";
    el.selectedInstanceFolder.textContent = state.settings.gameDir || "-";
    el.loaderSelect.value = "Vanilla";
    return;
  }

  el.selectedTitle.textContent = instance.name;
  el.selectedSubtitle.textContent = instance.minecraftDir;
  el.playCallout.textContent = `${instance.name} is ready to launch.`;
  el.selectedInstanceName.textContent = instance.name;
  el.selectedInstanceVersion.textContent = instance.versionId || "Unknown";
  el.selectedInstanceLoader.textContent = instance.loader || "Vanilla";
  el.selectedInstanceRam.textContent = `${instance.ramMb || state.settings.ramMb || 4096} MiB`;
  el.selectedInstanceJava.textContent = instance.javaPath ? "Custom" : (state.settings.javaPath ? "Custom" : "Auto");
  el.selectedInstanceFolder.textContent = instance.minecraftDir || state.settings.gameDir || "-";
  el.instanceNameInput.value = instance.name;
  const fallbackVersion = instance.versionId || state.versions[0]?.id || "";
  el.versionSelect.value = fallbackVersion;
  el.loaderSelect.value = instance.loader || "Vanilla";
  el.usernameInput.value = instance.offlineUsername || state.settings.offlineUsername || "Player";
  el.javaPathInput.value = instance.javaPath || state.settings.javaPath || "";
}

function renderVersionTable() {
  el.versionTableBody.innerHTML = "";
  for (const version of state.versions.slice(0, 150)) {
    const row = document.createElement("tr");
    row.innerHTML = "<td></td><td></td><td></td><td></td><td></td>";
    row.children[0].textContent = version.id;
    row.children[1].textContent = "Vanilla";
    row.children[2].textContent = version.type || "release";
    row.children[3].textContent = "Remote";
    row.children[4].textContent = "Available";
    el.versionTableBody.append(row);
  }
}

async function loadMods() {
  try {
    const mods = await window.launcherApi.listMods(state.selectedInstance?.id || null);
    el.modsTableBody.innerHTML = "";
    if (mods.length === 0) {
      const row = document.createElement("tr");
      row.innerHTML = '<td colspan="6">No .jar mods found.</td>';
      el.modsTableBody.append(row);
      return;
    }
    for (const mod of mods) {
      const row = document.createElement("tr");
      row.dataset.status = mod.status || "";
      row.innerHTML = "<td></td><td></td><td></td><td></td><td></td><td></td>";
      row.children[0].textContent = mod.filename;
      row.children[1].textContent = mod.name;
      row.children[2].textContent = mod.version || "-";
      row.children[3].textContent = mod.loader;
      row.children[4].textContent = mod.status;
      const button = document.createElement("button");
      button.textContent = "Delete";
      button.addEventListener("click", async () => {
        await window.launcherApi.deleteMod(mod.path);
        await loadMods();
      });
      row.children[5].append(button);
      el.modsTableBody.append(row);
    }
  } catch (error) {
    appendLog(`Mod refresh failed: ${error.message}`);
  }
}

async function addMods() {
  await window.launcherApi.addMods(state.selectedInstance?.id || null);
  await loadMods();
}

async function openFolder(folderKey) {
  try {
    const folder = await window.launcherApi.openFolder(folderKey, state.selectedInstance?.id || null);
    appendLog(`Opened folder: ${folder}`);
  } catch (error) {
    appendLog(`Open folder failed: ${error.message}`);
  }
}

async function createInstance() {
  if (state.versions.length === 0) await loadVersions(false);
  const latest = el.versionSelect.value || state.selectedInstance?.versionId || state.versions[0]?.id || "";
  if (!latest) {
    appendLog("No Minecraft version is available to create an instance.");
    return;
  }
  const instance = await window.launcherApi.createInstance({
    name: latest ? `Minecraft ${latest}` : "New Instance",
    versionId: latest,
    ramMb: state.settings.ramMb,
    autoMemory: state.settings.autoMemory,
    loader: el.loaderSelect.value,
    javaMode: state.settings.javaMode,
    javaPath: state.settings.javaPath,
    javaArgs: state.settings.javaArgs,
    minecraftArgs: state.settings.minecraftArgs,
    wrapperCommand: state.settings.wrapperCommand,
    windowWidth: state.settings.windowWidth,
    windowHeight: state.settings.windowHeight,
    fullscreen: state.settings.fullscreen,
    offlineUsername: el.usernameInput.value.trim() || state.settings.offlineUsername || "Player"
  });
  state.selectedInstance = instance;
  await loadInstances();
  showView("playView");
  appendLog(`Created instance ${instance.name}.`);
}

async function saveSelectedInstance(event) {
  event?.preventDefault?.();
  if (!state.selectedInstance) return;
  state.settings = collectSettings();
  const versionId = el.versionSelect.value || state.selectedInstance.versionId || state.versions[0]?.id || "";

  const updated = await window.launcherApi.updateInstance(state.selectedInstance.id, {
    name: el.instanceNameInput.value.trim() || state.selectedInstance.name,
    versionId,
    ramMb: state.settings.ramMb,
    autoMemory: state.settings.autoMemory,
    loader: el.loaderSelect.value,
    javaMode: state.settings.javaMode,
    javaPath: el.javaPathInput.value.trim() || state.settings.javaPath,
    javaArgs: state.settings.javaArgs,
    minecraftArgs: state.settings.minecraftArgs,
    wrapperCommand: state.settings.wrapperCommand,
    windowWidth: state.settings.windowWidth,
    windowHeight: state.settings.windowHeight,
    fullscreen: state.settings.fullscreen,
    offlineUsername: el.usernameInput.value.trim() || "Player"
  });
  await window.launcherApi.updateSettings(state.settings);
  state.selectedInstance = updated;
  await loadInstances();
  appendLog(`Saved instance ${updated.name}.`);
}

async function selectJava() {
  const javaPath = await window.launcherApi.selectJava();
  if (javaPath) {
    await checkAndApplyJavaPath(javaPath, false);
  }
}

async function detectJava(quiet) {
  const detected = await window.launcherApi.detectJava();
  state.detectedJava = detected;
  if (detected.ok) {
    el.detectedJavaLabel.textContent = `Detected Java ${detected.version}`;
    el.javaArchLabel.textContent = navigator.userAgent.includes("ARM") ? "ARM64" : "System";
    el.javaVendorLabel.textContent = detected.message.split("\n")[0] || "Detected";
    if (!quiet || (!el.javaPathInput.value && !el.dialogJavaPathInput.value)) {
      el.javaPathInput.value = detected.javaPath;
      el.dialogJavaPathInput.value = detected.javaPath;
    }
    if (!quiet) appendLog(`Detected Java ${detected.version}: ${detected.javaPath}`);
  } else {
    el.detectedJavaLabel.textContent = "Java was not detected";
    if (!quiet) appendLog(detected.message);
  }
}

async function checkAndApplyJavaPath(javaPath, quiet) {
  const checked = await window.launcherApi.checkJava(javaPath);
  if (checked.ok) {
    el.javaPathInput.value = checked.javaPath;
    el.dialogJavaPathInput.value = checked.javaPath;
    el.detectedJavaLabel.textContent = `Detected Java ${checked.version}`;
    el.javaVendorLabel.textContent = checked.message.split("\n")[0] || "Detected";
    if (!quiet) appendLog(`Java OK ${checked.version}: ${checked.javaPath}`);
    return true;
  }

  el.detectedJavaLabel.textContent = "Java path is invalid";
  if (!quiet) appendLog(`Java check failed: ${checked.message}`);
  return false;
}

async function playSelectedInstance() {
  if (!state.selectedInstance) return;
  await saveSelectedInstance();
  state.launching = true;
  el.playButton.disabled = true;
  el.stopButton.disabled = false;
  try {
    appendLog("Preparing launch...");
    const launch = await window.launcherApi.launch(state.selectedInstance.id);
    appendLog(`Started Java process ${launch.pid}.`);
    await loadMods();
  } catch (error) {
    state.launching = false;
    el.playButton.disabled = false;
    el.stopButton.disabled = true;
    appendLog(formatUserFacingError(error, "Launch failed."));
  }
}

async function stopLaunch() {
  await window.launcherApi.stop();
  appendLog("Stop requested.");
}

function updateProgress(payload) {
  const total = Number(payload.total || 0);
  const current = Number(payload.current || 0);
  const label = payload.label || "download";
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;
  const key = `${label}:${payload.phase || "downloading"}`;
  const now = Date.now();
  const previous = state.progressState.get(key) || { time: now, current: 0 };
  state.progressState.set(key, { time: now, current });
  const elapsed = Math.max(1, now - previous.time);
  const delta = Math.max(0, current - previous.current);
  const speed = delta > 0 ? (delta / elapsed) * 1000 : 0;
  const remaining = total > 0 ? Math.max(0, total - current) : 0;
  const eta = speed > 0 && remaining > 0 ? formatDuration((remaining / speed) * 1000) : "";
  const phase = payload.phase === "done" ? "Completed" : payload.phase === "cached" ? "Cached" : "Downloading";
  el.progressLabel.textContent = eta ? `${phase} ${label} · ${eta} left` : `${phase} ${label}`;
  el.progressPercent.textContent = `${percent}%`;
  el.downloadProgress.value = percent;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatUserFacingError(error, prefix = "Something went wrong.") {
  const message = String(error?.message || error || "");
  if (/fetch failed/i.test(message) || /network/i.test(message)) {
    return `${prefix} Check your connection and try again.`;
  }
  if (/Java was not found/i.test(message) || /No Java executable/i.test(message)) {
    return `${prefix} No usable Java runtime was found.`;
  }
  if (/not found/i.test(message)) {
    return `${prefix} The selected instance could not be found.`;
  }
  return `${prefix} ${message}`.trim();
}

function appendLog(message) {
  el.logConsole.textContent += `${String(message).trimEnd()}\n`;
  el.logConsole.scrollTop = el.logConsole.scrollHeight;
}

async function copyLogs() {
  await window.launcherApi.copyLogs(el.logConsole.textContent);
  appendLog("Copied logs to clipboard.");
}

async function exportLogs() {
  const filePath = await window.launcherApi.exportLogs(el.logConsole.textContent);
  if (filePath) appendLog(`Exported logs to ${filePath}`);
}

function renderLogSearch() {
  const query = el.logSearchInput.value.trim().toLowerCase();
  if (!query) {
    el.logConsole.dataset.search = "";
    return;
  }
  el.logConsole.dataset.search = query;
}

boot();
