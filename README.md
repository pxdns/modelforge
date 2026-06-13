# ModelForge Launcher

ModelForge is a small Electron launcher for managing vanilla Minecraft installs and local instance folders. It downloads version metadata, libraries, assets, and client jars from Mojang's public launch services, then starts the game with a Java process owned by the launcher.

The app keeps authentication out of scope. The username field is a local display name used when constructing launch arguments; it is not an account login flow.

## Development

```sh
npm install
npm start
```

## Build

```sh
npm run build
```

macOS artifacts are built in GitHub Actions and uploaded from the `dist` directory.

## Layout

```text
main/       Electron app lifecycle and IPC handlers
renderer/   Launcher interface
core/       Version downloads, Java detection, instances, and launch commands
instances/  Local instance configs and per-instance Minecraft folders
```

## Runtime

- Java is required. ModelForge checks common install locations and can also use a manually selected Java executable.
- The Minecraft game directory is user-selectable.
- Version data comes from `https://launchermeta.mojang.com/mc/game/version_manifest.json`.
- Each instance has its own folder for saves, config, logs, mods, and native libraries.
