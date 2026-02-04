const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const srcFile = path.join(rootDir, "src", "lens-worker.js");
const distDirs = [path.join(rootDir, "dist", "cjs"), path.join(rootDir, "dist", "esm")];

for (const distDir of distDirs) {
  fs.mkdirSync(distDir, { recursive: true });
  const destFile = path.join(distDir, "lens-worker.js");
  fs.copyFileSync(srcFile, destFile);
}
