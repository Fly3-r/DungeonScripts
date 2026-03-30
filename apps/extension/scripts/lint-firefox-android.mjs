import { buildExtensionTarget } from "./build-dist.mjs";
import { runWebExt } from "./web-ext-cli.mjs";

const { targetDir } = await buildExtensionTarget("firefox-android");

await runWebExt(["lint", "--source-dir", targetDir, ...process.argv.slice(2)]);
