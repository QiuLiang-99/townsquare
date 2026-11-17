"use strict";
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const send = (socket, command, payload) => {
  assert.strictEqual(socket.readyState, WebSocket.OPEN, `Cannot send ${command}: socket is not open`);
  socket.send(JSON.stringify([command, payload]));
};

async function until(predicate, label, timeout = 3000) {
  const deadline = Date.now() + timeout;
  do {
    const value = await predicate();
    if (value) return value;
    await wait(15);
  } while (Date.now() < deadline);
  throw Error(`Timed out waiting for ${label}`);
}

async function frame(socket, command, predicate = () => true, timeout = 3000) {
  return until(() => {
    if (socket.parseError) throw socket.parseError;
    const index = socket.messages.findIndex(([cmd, payload]) => cmd === command && predicate(payload));
    if (index >= 0) return { payload: socket.messages.splice(index, 1)[0][1] };
    if (socket.closeInfo) throw Error(`Socket closed before ${command}: ${JSON.stringify(socket.closeInfo)}`);
    if (socket.socketError) throw socket.socketError;
    return false;
  }, `${command} (${socket.url})`, timeout).then(({ payload }) => payload);
}

async function closed(socket, timeout = 3000) {
  return until(() => socket.closeInfo, `close (${socket.url})`, timeout);
}

let sequence = 0;
async function alive(socket) {
  const marker = `test-barrier-${++sequence}`;
  send(socket, "ping", ["", marker]);
  await frame(socket, "pong", (payload) => payload === marker);
}

// Call after an ordered response/barrier. Keep checking both history and liveness
// for a finite window so silence alone cannot make a negative assertion pass.
async function absent(socket, predicate, label, since = 0, duration = 120) {
  await alive(socket);
  const deadline = Date.now() + duration;
  do {
    assert.strictEqual(socket.readyState, WebSocket.OPEN, `${label}: connection closed`);
    assert.ok(!socket.history.slice(since).some(predicate), label);
    await wait(15);
  } while (Date.now() < deadline);
  await alive(socket);
  assert.ok(!socket.history.slice(since).some(predicate), label);
}

function createClients() {
  const clients = [];
  async function connect(url) {
    if (url.includes("/ws/") && !url.includes("?")) {
      url += "?auth=test-" + url.split("/").pop();
    }
    const socket = new WebSocket(url, { handshakeTimeout: 3000 });
    clients.push(socket);
    socket.messages = [];
    socket.msgs = socket.messages; // Existing port-3000 smoke test compatibility.
    socket.history = [];
    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        socket.messages.push(message);
        socket.history.push(message);
      } catch (error) {
        socket.parseError = error;
      }
    });
    socket.on("close", (code, reason) => {
      socket.closeInfo = { code, reason: reason.toString() };
    });
    socket.on("error", (error) => { socket.socketError = error; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.terminate();
        reject(Error(`Timed out connecting to ${url}`));
      }, 3500);
      const finish = (error) => {
        clearTimeout(timer);
        socket.removeListener("open", opened);
        socket.removeListener("error", failed);
        error ? reject(error) : resolve();
      };
      const opened = () => finish();
      const failed = (error) => finish(error);
      socket.once("open", opened);
      socket.once("error", failed);
    });
    return socket;
  }
  async function cleanup() {
    await Promise.all(clients.map(async (socket) => {
      if (socket.readyState === WebSocket.CLOSED) return;
      socket.terminate();
      await closed(socket);
    }));
  }
  return { connect, cleanup };
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (data) => { body += data; });
      response.on("error", reject);
      response.on("end", () => {
        try {
          assert.strictEqual(response.statusCode, 200, `HTTP ${response.statusCode} from ${url}`);
          resolve(JSON.parse(body));
        } catch (error) { reject(error); }
      });
    });
    request.setTimeout(700, () => request.destroy(Error(`HTTP timeout: ${url}`)));
    request.on("error", reject);
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function startServer({ grace = 900, port = undefined } = {}) {
  port = port === undefined ? await freePort() : port;
  const avatarDir = fs.mkdtempSync(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), "townsquare-test-avatars-"));
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(port), ROOM_GRACE_MS: String(grace), RATE_LIMIT: "1000", AVATAR_DIR: avatarDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let spawnError;
  let exit;
  let didClose = false;
  const capture = (data) => { output = (output + data.toString()).slice(-16000); };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  child.on("error", (error) => { spawnError = error; });
  child.on("exit", (code, signal) => { exit = { code, signal }; });
  child.on("close", () => { didClose = true; });
  const diagnostics = () => `port=${port}, pid=${child.pid}, exit=${JSON.stringify(exit)}\n${output}`;
  async function cleanup() {
    try {
      if (!didClose) {
        child.kill();
        try {
          await until(() => didClose, "backend process exit", 3500);
        } catch {
          child.kill("SIGKILL");
          await until(() => didClose, "forced backend process exit", 3000);
        }
      }
    } finally {
      fs.rmSync(avatarDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
  try {
    await until(async () => {
      if (spawnError) throw spawnError;
      if (exit) throw Error(`Backend exited before ready: ${JSON.stringify(exit)}`);
      if (!output.includes("listening on")) return false;
      try { return (await getJson(`http://127.0.0.1:${port}/healthz`)).ok; }
      catch { return false; }
    }, "isolated backend readiness", 8000);
  } catch (error) {
    try { await cleanup(); } catch (cleanupError) { error.message += `\nCleanup failed: ${cleanupError.message}`; }
    error.message += `\n${diagnostics()}`;
    throw error;
  }
  return { port, grace, ws: `ws://127.0.0.1:${port}`, http: `http://127.0.0.1:${port}`, cleanup, diagnostics };
}

module.exports = { wait, send, until, frame, closed, alive, absent, createClients, getJson, startServer };
