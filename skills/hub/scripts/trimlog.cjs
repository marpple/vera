#!/usr/bin/env node
"use strict";
// Moves the log lines after the 30th out of a hub's state.js into log.md in the same folder, so state.js stays small.
// Only the tail of the `log` array leaves state.js: every other byte of the file stays as the hub wrote it.
//   node <this skill's folder>/scripts/trimlog.cjs <hub folder>
// Exit 0: "ok: moved <n> log lines to log.md, kept 30", or "ok: nothing to move, <k> log lines".
// Exit 2: "refused: <reason>". Every refusal leaves state.js as it was. It leaves log.md as it was too, except when state.js
// cannot be written (or changed under the run) after log.md was: then the moved lines are in both files.
// The moved lines always go on top of log.md, and a run interrupted between the two writes leaves them in both files.
// The next run then writes them to log.md a second time: a duplicate, never a loss.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const KEEP = 30;

const refuse = why => { console.log(`refused: ${why}`); process.exit(2); };
const args = process.argv.slice(2);
if (args.length !== 1) refuse("usage: trimlog.cjs <hub folder>");
const statePath = path.join(args[0], "state.js");
const mdPath = path.join(args[0], "log.md");

function read(file, missing) {
  try { return fs.readFileSync(file, "utf8"); }
  catch (e) { return e.code === "ENOENT" && missing !== undefined ? missing : refuse(`${path.basename(file)} cannot be read (${e.code || e.message})`); }
}

// state.js runs the way the page runs it; the result is copied so that comparing it does not depend on the realm.
function parse(src) {
  const ctx = { window: {} };
  try { vm.runInNewContext(src, ctx, { timeout: 1000 }); }
  catch (e) { return refuse(`state.js does not run (${e.message})`); }
  const state = ctx.window.HUB_STATE;
  try { return state === undefined ? undefined : JSON.parse(JSON.stringify(state)); }
  catch (e) { return refuse(`HUB_STATE cannot be copied as JSON (${e.message})`); }
}

// Walks the code of src from `from`, skipping strings and comments. onCode(i, c) gets each code character, and a string's
// opening quote; returning false stops the walk.
function scan(src, from, onCode) {
  const n = src.length;
  let i = from;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { i = src.indexOf("\n", i); if (i < 0) return; continue; }
    if (c === "/" && d === "*") { i = src.indexOf("*/", i + 2); if (i < 0) return; i += 2; continue; }
    if (onCode(i, c) === false) return;
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      i = j + 1;
    } else i++;
  }
}

const OPEN = "{[(", CLOSE = "}])";
const LOG_KEY = /(?:log|"log"|'log')\s*:\s*\[/y;

// The index of the "[" of the top object's `log` array.
function findLog(src) {
  let depth = 0, open = -1;
  scan(src, 0, (i, c) => {
    if (OPEN.includes(c)) depth++;
    else if (CLOSE.includes(c)) depth--;
    else if (depth === 1 && !/[\w$.]/.test(src[i - 1] || " ")) {
      LOG_KEY.lastIndex = i;
      const m = LOG_KEY.exec(src);
      if (m) { open = i + m[0].length - 1; return false; }
    }
  });
  return open;
}

// The index of the "]" that closes the array opened at `open`, and the commas between its elements.
function elements(src, open) {
  let depth = 0, close = -1;
  const commas = [];
  scan(src, open, (i, c) => {
    if (OPEN.includes(c)) depth++;
    else if (CLOSE.includes(c)) { depth--; if (depth === 0) { close = i; return false; } }
    else if (c === "," && depth === 1) commas.push(i);
  });
  return { close, commas };
}

// The first code character after index i, past whitespace and comments.
function nextCode(src, i) {
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src.startsWith("//", i)) { i = src.indexOf("\n", i); if (i < 0) return ""; }
    else if (src.startsWith("/*", i)) { i = src.indexOf("*/", i + 2); if (i < 0) return ""; i += 2; }
    else return src[i] || "";
  }
}

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); }
  catch (e) { try { fs.rmSync(tmp, { force: true }); } catch {} refuse(`${path.basename(file)} cannot be written (${e.code || e.message})`); }
}

const src = read(statePath);
const before = parse(src);
if (before === undefined) refuse("state.js sets no HUB_STATE");
if (!Array.isArray(before.log)) refuse("HUB_STATE has no log array");
if (before.log.length <= KEEP) {
  console.log(`ok: nothing to move, ${before.log.length} log lines`);
  process.exit(0);
}

const open = findLog(src);
if (open < 0) refuse("cannot find the log array in the text of state.js");
const { close, commas } = elements(src, open);
if (close < 0 || commas.length < KEEP) refuse(`cannot find the end of log line ${KEEP}`);
if (![",", "}"].includes(nextCode(src, close + 1))) refuse("the log is built by an expression, not written as a list");

// Cut from the comma after the 30th element up to the whitespace that precedes the closing "]".
const cutFrom = commas[KEEP - 1];
let cutTo = close;
while (/\s/.test(src[cutTo - 1])) cutTo--;
if (cutTo <= cutFrom) refuse(`cannot find the end of log line ${KEEP}`);
const out = src.slice(0, cutFrom) + src.slice(cutTo);

const after = parse(out);
const moved = before.log.slice(KEEP);
const restAfter = { ...after };
delete restAfter.log;
const keptLog = (after || {}).log;
const restBefore = { ...before };
delete restBefore.log;
let same = false;
try {
  assert.deepStrictEqual(keptLog, before.log.slice(0, KEEP));
  assert.deepStrictEqual(restAfter, restBefore);
  same = true;
} catch {}
if (!same) refuse("the result did not match");

// log.md first, so a run cut short leaves the lines in both files and loses none.
const line = e => "- " + (typeof e === "string" ? e : JSON.stringify(e)).replace(/\r\n|\r|\n/g, " ");
const text = moved.map(line).join("\n") + "\n";
const old = read(mdPath, "");
writeAtomic(mdPath, text + old);
if (read(statePath) !== src) refuse("state.js changed while the script ran");
writeAtomic(statePath, out);
console.log(`ok: moved ${moved.length} log lines to log.md, kept ${KEEP}`);
