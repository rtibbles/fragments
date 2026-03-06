import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

let tauriDriver: ChildProcess;

function findTauriDriver(): string {
  try {
    execFileSync("which", ["tauri-driver"], { stdio: "pipe" });
    return "tauri-driver";
  } catch {
    return join(homedir(), ".cargo", "bin", "tauri-driver");
  }
}

export const config = {
  specs: ["./e2e/**/*.e2e.ts"],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "wry",
      "wdio:enforceWebDriverClassic": true,
      "tauri:options": {
        application: resolve("src-tauri/target/debug/fragments"),
      },
    },
  ],
  logLevel: "warn",
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 30000,
  },
  hostname: "localhost",
  port: 4444,
  onPrepare() {
    tauriDriver = spawn(findTauriDriver(), [], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return new Promise<void>((resolve) => {
      setTimeout(resolve, 2000);
    });
  },
  onComplete() {
    if (tauriDriver) {
      tauriDriver.kill();
    }
  },
};
