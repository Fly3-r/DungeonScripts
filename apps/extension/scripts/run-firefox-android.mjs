import { buildExtensionTarget } from "./build-dist.mjs";
import { androidRunDefaults, runWebExt } from "./web-ext-cli.mjs";

const { targetDir } = await buildExtensionTarget("firefox-android");
const userArgs = process.argv.slice(2);
const runArgs = await androidRunDefaults([
  "run",
  "--target=firefox-android",
  "--source-dir",
  targetDir,
  ...userArgs
]);

await runWebExt(runArgs);
