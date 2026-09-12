import path from "node:path";
import type { CliOptions } from "./types";

function flagValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function hasFlag(argv: string[], name: string) {
  return argv.includes(name);
}

function listFlag(argv: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === name && argv[i + 1]) {
      values.push(
        ...argv[i + 1]!
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      );
    }
  }
  return values;
}

function numberFlag(argv: string[], name: string, fallback: number) {
  const raw = flagValue(argv, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number for ${name}: ${raw}`);
  }
  return value;
}

export function printHelp() {
  console.log(`Usage:
  npm run generate:normals -- --input <glb> --output <glb> [options]

Options:
  --input <path>                   Input GLB (required)
  --output <path>                  Output GLB (required; never overwrites input)
  --strength <n>                   Height→normal strength (default 0.35)
  --blur <n>                       Gaussian blur sigma before Sobel (default 1)
  --max-size <n>                   Max generated texture edge (default 2048)
  --invert-height                  Invert luminance height
  --include <pattern[,pattern]>    Only process matching material names (regex)
  --exclude <pattern[,pattern]>    Skip matching material names (regex)
  --overwrite-existing-normals     Replace materials that already have normals
  --diagnostics-dir <path>         Diagnostic output root (default generated/material-textures)
  --normal-scale <n>               Material normalTexture.scale (default = strength)
  --help                           Show this help
`);
}

export function parseArgs(argv: string[]): CliOptions | "help" {
  if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) return "help";

  const input = flagValue(argv, "--input");
  const output = flagValue(argv, "--output");
  if (!input || !output) {
    throw new Error("--input and --output are required. Pass --help for usage.");
  }

  const resolvedInput = path.resolve(input);
  const resolvedOutput = path.resolve(output);
  if (resolvedInput === resolvedOutput) {
    throw new Error("Refusing to overwrite the input GLB. Choose a different --output.");
  }

  const strength = numberFlag(argv, "--strength", 0.35);
  const blur = numberFlag(argv, "--blur", 1);
  const maxSize = numberFlag(argv, "--max-size", 2048);
  const normalScale = numberFlag(argv, "--normal-scale", strength);

  return {
    input: resolvedInput,
    output: resolvedOutput,
    strength,
    blur,
    maxSize,
    invertHeight: hasFlag(argv, "--invert-height"),
    include: listFlag(argv, "--include"),
    exclude: listFlag(argv, "--exclude"),
    overwriteExistingNormals: hasFlag(argv, "--overwrite-existing-normals"),
    diagnosticsDir: path.resolve(
      flagValue(argv, "--diagnostics-dir") ?? "generated/material-textures",
    ),
    normalScale,
  };
}
