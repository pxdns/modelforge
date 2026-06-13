const path = require("path");
const { MinecraftLauncher } = require("../core/launcher");

[
  "../core/fsUtils",
  "../core/http",
  "../core/instanceManager",
  "../core/javaDetector",
  "../core/launcher",
  "../core/paths",
  "../core/rules",
  "../core/settingsStore",
  "../core/versionManager"
].forEach(require);

async function main() {
  const settings = {
    get(key) {
      return key === "gameDir" ? path.join("/tmp", "minecraft-game") : "";
    }
  };
  const versionManager = {
    getClasspath: async () => [
      path.join("/tmp", "minecraft-game", "libraries", "example.jar"),
      path.join("/tmp", "minecraft-game", "versions", "1.test", "1.test.jar")
    ]
  };

  const launcher = new MinecraftLauncher(settings, versionManager);
  const args = await launcher.buildArguments(
    {
      name: "Check",
      ramMb: 2048,
      offlineUsername: "Local_Player",
      minecraftDir: path.join("/tmp", "minecraft-instance"),
      instanceDir: path.join("/tmp", "minecraft-instance-root")
    },
    {
      id: "1.test",
      type: "release",
      assets: "1",
      assetIndex: { id: "1" },
      mainClass: "net.minecraft.client.main.Main",
      arguments: {
        jvm: ["-Djava.library.path=${natives_directory}", "-cp", "${classpath}"],
        game: [
          "--username",
          "${auth_player_name}",
          {
            rules: [{ action: "allow", features: { is_demo_user: true } }],
            value: ["--demo"]
          }
        ]
      }
    },
    path.join("/tmp", "minecraft-natives")
  );

  if (!args.includes("net.minecraft.client.main.Main")) {
    throw new Error("Launch arguments are missing the main class.");
  }
  if (args.includes("--demo")) {
    throw new Error("Feature-gated launch arguments were enabled unexpectedly.");
  }
}

main()
  .then(() => console.log("Checks passed."))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
