import fs from "fs";
import fetch from "node-fetch";
import AdmZip from "adm-zip";

export async function downloadAndExtractZip(url, targetDir) {
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  const zip = new AdmZip(Buffer.from(buffer));
  zip.extractAllTo(targetDir, true);
}
