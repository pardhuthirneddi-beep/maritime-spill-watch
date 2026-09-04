#!/usr/bin/env node
// Kill stale esbuild service processes before starting vite dev server
import { execSync } from "child_process";

try {
  // Find all esbuild --service processes (not this script)
  const out = execSync("ps -eo pid,args | grep 'esbuild.*--service' | grep -v grep || true", { encoding: "utf8" });
  const lines = out.trim().split("\n").filter(Boolean);
  for (const line of lines) {
    const pid = line.trim().split(/\s+/)[0];
    if (pid && /^\d+$/.test(pid)) {
      try {
        process.kill(Number(pid), "SIGKILL");
        console.log(`Killed stale esbuild process ${pid}`);
      } catch { /* already dead */ }
    }
  }
} catch { /* ignore */ }
