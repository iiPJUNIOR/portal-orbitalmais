import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getVersion() {
  const now = new Date();
  
  // Format: DDMMYYYY.HHMMSS
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const timestamp = `${day}${month}${year}.${hours}${minutes}${seconds}`;
  
  let gitHash = '';
  try {
    gitHash = execSync('git rev-parse --short HEAD').toString().trim();
  } catch (err) {
    // Ignore git errors if git is not available
  }
  
  return gitHash ? `${timestamp}-${gitHash}` : timestamp;
}

const version = getVersion();
const versionFilePath = path.join(__dirname, '../src/version.ts');

const content = `export const APP_VERSION = "${version}";\n`;

fs.writeFileSync(versionFilePath, content, 'utf8');
console.log(`Updated app version in src/version.ts to: ${version}`);
