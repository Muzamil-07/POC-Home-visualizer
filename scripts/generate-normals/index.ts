import { parseArgs, printHelp } from "./cli-args";
import { runGenerateNormals } from "./process";

async function main() {
  const argv = process.argv.slice(2);
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error((error as Error).message);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (options === "help") {
    printHelp();
    return;
  }

  const started = Date.now();
  try {
    const report = await runGenerateNormals(options);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `Done in ${seconds}s. Generated ${report.processedCount}, reused ${report.reusedCount}, skipped ${report.skippedCount}.`,
    );
  } catch (error) {
    console.error("\ngenerate:normals failed:");
    console.error(error);
    process.exitCode = 1;
  }
}

void main();
