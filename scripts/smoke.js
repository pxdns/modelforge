const path = require("path");
const { MinecraftLauncher } = require("../core/launcher");

const modules = [
  "../core/fsUtils",
  "../core/http",
  "../core/instanceManager",
  "../core/javaDetector",
  "../core/launcher",
  "../core/paths",
  "../core/rules",
  "../core/settingsStore",
  "../core/versionManager"
];

for (const modulePath of modules) {
  require(modulePath);
}

async function testArgumentBuilder() {
  const settings = {
    get(key) {
      if (key === "gameDir") return path.join("/tmp", "minecraft-game");
      return "";
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
      name: "Smoke Test",
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
    throw new Error("Main class was not included in launch arguments.");
  }
  if (args.includes("--demo")) {
    throw new Error("Feature-gated demo arguments should not be enabled by default.");
  }
}

testArgumentBuilder()
  .then(() => {
    console.log("Smoke test passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
