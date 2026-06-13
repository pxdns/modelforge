# Vanilla Minecraft Launcher MVP

A lightweight Electron + Node.js launcher for vanilla Minecraft using Mojang's official version manifests and game files.

This MVP intentionally does not implement Microsoft authentication, cracked login, or account bypass. The local username field is only used as a display name for launches that do not require authenticated services.

## Run

```sh
npm install
npm start
```

## Project Structure

```text
main/       Electron main process and preload bridge
renderer/   Desktop UI
core/       Version downloading, instances, Java detection, launch logic
instances/  JSON-configured launcher instances and per-instance Minecraft folders
```

## Notes

- Java must be installed on the system. The launcher attempts to detect it automatically.
- The game directory can be changed in the UI.
- Vanilla versions are downloaded from Mojang's official manifest:
  `https://launchermeta.mojang.com/mc/game/version_manifest.json`
- Each instance has its own Minecraft folder for saves, configs, mods, logs, and runtime state.
