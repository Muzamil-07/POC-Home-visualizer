import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { GenerationReport, MaterialReport } from "./types";
import { formatBytes, pad } from "./util";

export function printConsoleReport(report: GenerationReport) {
  console.log("\n=== Normal-map generation report ===\n");
  console.log(`Input:  ${report.input} (${formatBytes(report.inputBytes)})`);
  console.log(`Output: ${report.output} (${formatBytes(report.outputBytes)})`);
  console.log(
    `Settings: strength=${report.settings.strength} blur=${report.settings.blur} maxSize=${report.settings.maxSize} invert=${report.settings.invertHeight} overwriteExisting=${report.settings.overwriteExistingNormals}`,
  );
  console.log(
    `Materials: generated=${report.processedCount} reused=${report.reusedCount} skipped=${report.skippedCount}`,
  );
  if (report.unsupportedFormats.length) {
    console.log(`Unsupported formats: ${report.unsupportedFormats.join(", ")}`);
  }

  const nameW = 28;
  const actionW = 14;
  const reasonW = 28;
  console.log(
    `\n${pad("MATERIAL", nameW)} ${pad("BASE", 6)} ${pad("NORM", 6)} ${pad("UV", 4)} ${pad("ACTION", actionW)} ${pad("REASON / NOTE", reasonW)}`,
  );
  console.log("-".repeat(nameW + 6 + 6 + 4 + actionW + reasonW + 5));

  for (const material of report.materials) {
    const note =
      material.skipReason ??
      (material.generatedWidth
        ? `${material.generatedWidth}×${material.generatedHeight}`
        : material.warning ?? "");
    console.log(
      `${pad(truncate(material.name || "(unnamed)", nameW - 1), nameW)} ${pad(material.hasBaseColorTexture ? "yes" : "no", 6)} ${pad(material.hasNormalTexture ? "yes" : "no", 6)} ${pad(material.missingUv ? "miss" : String(material.baseColorTexCoord ?? "—"), 4)} ${pad(material.action, actionW)} ${truncate(note, reasonW)}`,
    );
  }

  if (report.warnings.length) {
    console.log("\nWarnings:");
    for (const warning of report.warnings) {
      console.log(`  - ${warning}`);
    }
  }
  console.log("");
}

export async function writeReportJson(
  diagnosticsDir: string,
  report: GenerationReport,
) {
  const filePath = path.join(diagnosticsDir, "report.json");
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return filePath;
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

export function summarizeActions(materials: MaterialReport[]) {
  let processedCount = 0;
  let skippedCount = 0;
  let reusedCount = 0;
  for (const material of materials) {
    if (material.action === "generate") processedCount += 1;
    else if (material.action === "reuse") reusedCount += 1;
    else if (material.action === "skip") skippedCount += 1;
  }
  return { processedCount, skippedCount, reusedCount };
}
