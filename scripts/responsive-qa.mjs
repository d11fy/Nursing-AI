import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const origin = process.argv[2] || "http://localhost:3000";
const outputDir = path.resolve(process.argv[3] || ".qa/responsive");
const browserPath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const widths = [360, 375, 390, 430, 768, 1024, 1440];
const routes = ["/", "/download", "/privacy", "/terms", "/subscription-policy", "/file-policy", "/disclaimer"];
const port = 9300 + Math.floor(Math.random() * 500);
const profileDir = await mkdtemp(path.join(os.tmpdir(), "nursing-responsive-qa-"));

await mkdir(outputDir, { recursive: true });

const browser = spawn(browserPath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function json(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function waitForTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await json(`http://127.0.0.1:${port}/json/list`);
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await delay(100);
  }
  throw new Error("Chrome DevTools did not become ready");
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let requestId = 0;
  const pending = new Map();
  const events = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    const listeners = events.get(message.method) || [];
    listeners.forEach((listener) => listener(message.params));
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    ready,
    send(method, params = {}) {
      const id = ++requestId;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    once(method) {
      return new Promise((resolve) => {
        const listener = (params) => {
          events.set(method, (events.get(method) || []).filter((item) => item !== listener));
          resolve(params);
        };
        events.set(method, [...(events.get(method) || []), listener]);
      });
    },
    close() { socket.close(); },
  };
}

const results = [];
let client;

try {
  client = connect(await waitForTarget());
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  for (const route of routes) {
    for (const width of widths) {
      const height = width < 768 ? 900 : 1000;
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
      const loaded = client.once("Page.loadEventFired");
      await client.send("Page.navigate", { url: new URL(route, origin).toString() });
      await Promise.race([loaded, delay(10_000)]);
      await delay(250);

      const evaluation = await client.send("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => {
          const width = window.innerWidth;
          const offenders = [...document.querySelectorAll('body *')].filter((element) => {
            const style = getComputedStyle(element);
            if (style.position === 'fixed' || style.display === 'none' || style.visibility === 'hidden') return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 1 && (rect.left < -1 || rect.right > width + 1);
          }).slice(0, 12).map((element) => ({
            tag: element.tagName.toLowerCase(),
            className: String(element.className || '').slice(0, 160),
            text: String(element.textContent || '').trim().slice(0, 80),
            rect: element.getBoundingClientRect().toJSON(),
          }));
          return { title: document.title, viewport: width, scrollWidth: document.documentElement.scrollWidth, offenders };
        })()`,
      });
      const record = { route, requestedWidth: width, ...evaluation.result.value };
      results.push(record);

      if ((route === "/" && [360, 768, 1440].includes(width)) || (route !== "/" && width === 390)) {
        const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
        const slug = route === "/" ? "landing" : route.slice(1);
        await writeFile(path.join(outputDir, `${slug}-${width}.png`), Buffer.from(screenshot.data, "base64"));
      }
    }
  }

  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(results, null, 2));
  const failures = results.filter((result) => result.scrollWidth > result.viewport + 1 || result.offenders.length > 0);
  console.log(JSON.stringify({ checks: results.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  client?.close();
  browser.kill();
  if (browser.exitCode === null) {
    await Promise.race([once(browser, "exit"), delay(2_000)]);
  }
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}
