const UNSAFE_FILENAME_RUN = /[^a-zA-Z0-9._-]+/g;
const REPEATED_UNDERSCORES = /_+/g;
const EDGE_PUNCTUATION = /^[._-]+|[._-]+$/g;

function sanitizeFilenamePart(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .replace(UNSAFE_FILENAME_RUN, "_")
    .replace(REPEATED_UNDERSCORES, "_")
    .replace(EDGE_PUNCTUATION, "");
  return sanitized || fallback;
}

export function buildGcodeFilename(modelName: string, machineId: string): string {
  const withoutStl = modelName.trim().replace(/\.stl$/i, "");
  const model = sanitizeFilenamePart(withoutStl, "model");
  const machine = sanitizeFilenamePart(machineId, "machine");
  return `${model}_${machine}_clay.gcode`;
}

export interface DownloadGcodeArgs {
  gcode: string;
  modelName: string;
  machineId: string;
}

export function downloadGcode({
  gcode,
  modelName,
  machineId,
}: DownloadGcodeArgs): string {
  if (!gcode.trim()) {
    throw new Error("Cannot download blank G-code.");
  }

  const filename = buildGcodeFilename(modelName, machineId);
  const blob = new Blob([gcode], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return filename;
}
