const state = {
  settings: null,
  versions: [],
  instances: [],
  selectedInstance: null,
  launching: false
};

const el = {
  createInstanceButton: document.querySelector("#createInstanceButton"),
  instanceList: document.querySelector("#instanceList"),
  selectedTitle: document.querySelector("#selectedTitle"),
  selectedSubtitle: document.querySelector("#selectedSubtitle"),
  refreshVersionsButton: document.querySelector("#refreshVersionsButton"),
  gameDirInput: document.querySelector("#gameDirInput"),
  selectGameDirButton: document.querySelector("#selectGameDirButton"),
  usernameInput: document.querySelector("#usernameInput"),
  instanceForm: document.querySelector("#instanceForm"),
  instanceNameInput: document.querySelector("#instanceNameInput"),
  versionSelect: document.querySelector("#versionSelect"),
  ramSlider: document.querySelector("#ramSlider"),
  ramLabel: document.querySelector("#ramLabel"),
  javaPathInput: document.querySelector("#javaPathInput"),
  selectJavaButton: document.querySelector("#selectJavaButton"),
  detectJavaButton: document.querySelector("#detectJavaButton"),
  saveInstanceButton: document.querySelector("#saveInstanceButton"),
  playButton: document.querySelector("#playButton"),
  stopButton: document.querySelector("#stopButton"),
  progressLabel: document.querySelector("#progressLabel"),
  progressPercent: document.querySelector("#progressPercent"),
  downloadProgress: document.querySelector("#downloadProgress"),
  clearConsoleButton: document.querySelector("#clearConsoleButton"),
  logConsole: document.querySelector("#logConsole")
};

async function boot() {
  wireEvents();
  appendLog("Launcher ready.");
  state.settings = await window.launcherApi.getSettings();
  el.gameDirInput.value = state.settings.gameDir;
  el.usernameInput.value = state.settings.offlineUsername || "Player";
  await loadVersions(false);
  await loadInstances();
  const detected = await window.launcherApi.detectJava();
  if (detected.ok && !el.javaPathInput.value) {
    appendLog(`Detected Java ${detected.version}: ${detected.javaPath}`);
  } else if (!detected.ok) {
    appendLog(detected.message);
  }
}

function wireEvents() {
  el.refreshVersionsButton.addEventListener("click", async () => loadVersions(true));
  el.selectGameDirButton.addEventListener("click", selectGameDir);
  el.createInstanceButton.addEventListener("click", createInstance);
  el.instanceForm.addEventListener("submit", saveSelectedInstance);
  el.ramSlider.addEventListener("input", updateRamLabel);
  el.selectJavaButton.addEventListener("click", selectJava);
  el.detectJavaButton.addEventListener("click", detectJava);
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

async function loadVersions(forceRefresh) {
  try {
    appendLog(forceRefresh ? "Refreshing Mojang version manifest..." : "Loading versions...");
    const manifest = await window.launcherApi.listVersions(forceRefresh);
    state.versions = manifest.versions.filter((version) => version.type === "release");
    renderVersions();
    appendLog(`Loaded ${state.versions.length} release versions.`);
  } catch (error) {
    appendLog(`Version load failed: ${error.message}`);
  }
}

async function loadInstances() {
  state.instances = await window.launcherApi.listInstances();
  if (!state.selectedInstance && state.instances.length > 0) {
    state.selectedInstance = state.instances[0];
  }
  renderInstances();
  renderSelectedInstance();
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
  el.instanceList.innerHTML = "";
  if (state.instances.length === 0) {
    const empty = document.createElement("div");
    empty.className = "instance-item";
    empty.textContent = "No instances yet.";
    el.instanceList.append(empty);
    return;
  }

  for (const instance of state.instances) {
    const button = document.createElement("button");
    button.className = `instance-item ${state.selectedInstance?.id === instance.id ? "active" : ""}`;
    button.innerHTML = `<strong></strong><span></span>`;
    button.querySelector("strong").textContent = instance.name;
    button.querySelector("span").textContent = instance.versionId || "No version";
    button.addEventListener("click", () => {
      state.selectedInstance = instance;
      renderInstances();
      renderSelectedInstance();
    });
    el.instanceList.append(button);
  }
}

function renderSelectedInstance() {
  const instance = state.selectedInstance;
  el.playButton.disabled = !instance || state.launching;
  if (!instance) {
    el.selectedTitle.textContent = "Select an instance";
    el.selectedSubtitle.textContent = "Create or choose an instance to configure and play.";
    return;
  }

  el.selectedTitle.textContent = instance.name;
  el.selectedSubtitle.textContent = instance.minecraftDir;
  el.instanceNameInput.value = instance.name;
  el.versionSelect.value = instance.versionId;
  el.ramSlider.value = instance.ramMb || 2048;
  el.javaPathInput.value = instance.javaPath || "";
  el.usernameInput.value = instance.offlineUsername || state.settings.offlineUsername || "Player";
  updateRamLabel();
}

async function selectGameDir() {
  const gameDir = await window.launcherApi.selectDirectory();
  if (!gameDir) return;
  state.settings = await window.launcherApi.setGameDir(gameDir);
  el.gameDirInput.value = gameDir;
  state.selectedInstance = null;
  await loadVersions(false);
  await loadInstances();
  appendLog(`Game directory set to ${gameDir}`);
}

async function createInstance() {
  if (state.versions.length === 0) await loadVersions(false);
  const latest = state.versions[0]?.id || "";
  const instance = await window.launcherApi.createInstance({
    name: `Vanilla ${latest}`,
    versionId: latest,
    ramMb: Number(el.ramSlider.value || 2048),
    javaPath: el.javaPathInput.value.trim(),
    offlineUsername: el.usernameInput.value.trim() || "Player"
  });
  state.selectedInstance = instance;
  await loadInstances();
  appendLog(`Created instance ${instance.name}.`);
}

async function saveSelectedInstance(event) {
  event.preventDefault();
  if (!state.selectedInstance) return;

  const updated = await window.launcherApi.updateInstance(state.selectedInstance.id, {
    name: el.instanceNameInput.value.trim() || state.selectedInstance.name,
    versionId: el.versionSelect.value,
    ramMb: Number(el.ramSlider.value),
    javaPath: el.javaPathInput.value.trim(),
    offlineUsername: el.usernameInput.value.trim() || "Player"
  });
  state.selectedInstance = updated;
  await loadInstances();
  appendLog(`Saved instance ${updated.name}.`);
}

async function selectJava() {
  const javaPath = await window.launcherApi.selectJava();
  if (javaPath) el.javaPathInput.value = javaPath;
}

async function detectJava() {
  const detected = await window.launcherApi.detectJava();
  if (detected.ok) {
    el.javaPathInput.value = detected.javaPath;
    appendLog(`Detected Java ${detected.version}: ${detected.javaPath}`);
  } else {
    appendLog(detected.message);
  }
}

async function playSelectedInstance() {
  if (!state.selectedInstance) return;
  await saveSelectedInstance(new Event("submit"));
  state.launching = true;
  el.playButton.disabled = true;
  el.stopButton.disabled = false;
  try {
    appendLog("Preparing launch...");
    const launch = await window.launcherApi.launch(state.selectedInstance.id);
    appendLog(`Started Java process ${launch.pid}.`);
  } catch (error) {
    state.launching = false;
    el.playButton.disabled = false;
    el.stopButton.disabled = true;
    appendLog(`Launch failed: ${error.message}`);
  }
}

async function stopLaunch() {
  await window.launcherApi.stop();
  appendLog("Stop requested.");
}

function updateRamLabel() {
  el.ramLabel.textContent = `${el.ramSlider.value} MB`;
}

function updateProgress(payload) {
  const total = Number(payload.total || 0);
  const current = Number(payload.current || 0);
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;
  el.progressLabel.textContent = `${payload.phase}: ${payload.label}`;
  el.progressPercent.textContent = `${percent}%`;
  el.downloadProgress.value = percent;
}

function appendLog(message) {
  el.logConsole.textContent += `${String(message).trimEnd()}\n`;
  el.logConsole.scrollTop = el.logConsole.scrollHeight;
}

boot();
