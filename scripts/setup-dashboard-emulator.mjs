import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dest = path.join(root, "packages", "dashboard", ".env.local");
const src = path.join(root, "packages", "dashboard", ".env.emulator");

if (fs.existsSync(dest)) {
  console.log("packages/dashboard/.env.local already exists — not overwriting.");
  process.exit(0);
}

fs.copyFileSync(src, dest);
console.log("Created packages/dashboard/.env.local from .env.emulator.");
console.log("Add your Firebase web app keys (VITE_FIREBASE_*) from the Firebase console if they are still empty.");
