#!/usr/bin/env node
"use strict";
// Reads a reviewer's saved answer (a VERDICT: line, then one line per finding) so the findings pass through the hub's context once.
//   node <this skill's folder>/scripts/verdict.cjs check  <verdict file>
//   node <this skill's folder>/scripts/verdict.cjs record <verdict file> <walkthrough file> --round <n> --head <sha> [--from <earlier walkthrough file>]
//   node <this skill's folder>/scripts/verdict.cjs reply  <verdict file> [--except <i>[,<i>...]]
// check, record exit 0: "ok: <PASS|CHANGES>, <b> blocking, <n> non-blocking", then one line per blocking finding:
//   "<i>. <file>:<line> — <what> — <why> — <fix>" (i counts from 1, blocking findings only, in the file's order).
// reply exit 0: "REVIEW:", then the blocking findings in the same form and with the same numbers, minus those named in --except.
// Exit 2: "cannot parse: <reason>". Every refusal leaves every file as it was and removes its own temp file.
// The verdict file: a BOM is dropped, lines split on \r?\n, each trimmed, blank lines dropped. The first line is exactly
// "VERDICT: PASS" or "VERDICT: CHANGES"; every other line is "[blocking] " or "[non-blocking] ", then <file>:<line> or
// <file>:<line>-<line>, then what, why, fix, each after " — " (U+2014) or " – " (U+2013); from the fourth separator on, the text belongs to fix.
// PASS with a blocking line, or CHANGES with none, is refused.
// record: the round { round, verdict, head, findings: [{ level, file, line, what: "<what> — <why>", fix: "" }] } goes into the
// walkthrough's `review` array (made if missing). A round already there is replaced, and a non-empty fix of a finding with the same
// level, file, line, and what moves to the new one. A review that is neither missing, null, nor a list is refused. Other rounds are
// kept exactly as they are (rounds without a numeric round sort last, in their order). --from copies every entry of the earlier walkthrough's review in its order, except a numbered round whose number the target held before the copy and an unnumbered entry the target already holds as identical JSON.
// The walkthrough is written once, after every check, to a temp file next to it and renamed over it; text that would not change is not written.
const fs = require("node:fs");

const tmps = [];
const refuse = why => {
  for (const t of tmps) { try { fs.rmSync(t, { force: true }); } catch {} }
  console.log(`cannot parse: ${why}`);
  process.exit(2);
};

function read(file) {
  try { return fs.readFileSync(file, "utf8"); }
  catch (e) { return refuse(`${file} cannot be read (${e.code || e.message})`); }
}

const FINDING = /^\[(blocking|non-blocking)\] (\S+?):(\d+)(?:-(\d+))? [—–] (.+?) [—–] (.+?) [—–] (.+)$/;

function parseVerdict(file) {
  const lines = read(file).replace(/^﻿/, "").split(/\r?\n/).map(l => l.trim()).filter(l => l !== "");
  if (lines[0] !== "VERDICT: PASS" && lines[0] !== "VERDICT: CHANGES") refuse(`${file} does not start with "VERDICT: PASS" or "VERDICT: CHANGES"`);
  const verdict = lines[0].slice("VERDICT: ".length);
  const findings = lines.slice(1).map((l, i) => {
    const m = FINDING.exec(l);
    if (!m) return refuse(`line ${i + 2} of ${file} is not "[blocking] or [non-blocking] <file>:<line> — what — why — fix": ${l}`);
    return { level: m[1], file: m[2], line: Number(m[3]), where: m[4] ? `${m[2]}:${m[3]}-${m[4]}` : `${m[2]}:${m[3]}`, what: m[5], why: m[6], fix: m[7] };
  });
  const blocking = findings.filter(f => f.level === "blocking");
  if (verdict === "PASS" && blocking.length) refuse("the verdict is PASS but a finding is blocking");
  if (verdict === "CHANGES" && !blocking.length) refuse("the verdict is CHANGES but no finding is blocking");
  return { verdict, findings, blocking };
}

const show = (f, i) => `${i}. ${f.where} — ${f.what} — ${f.why} — ${f.fix}`;

function readWalk(file) {
  const m = read(file).match(/^\s*window\.HUB_WALK\s*=\s*([\s\S]*?);?\s*$/);
  let w;
  try { w = m && JSON.parse(m[1]); } catch { w = undefined; }
  if (!w || typeof w !== "object" || Array.isArray(w)) refuse(`${file} is not "window.HUB_WALK = <JSON object>;"`);
  return w;
}

const sameFinding = (a, b) => a.level === b.level && a.file === b.file && a.line === b.line && a.what === b.what;

function record(v, walkFile, round, head, fromFile) {
  const before = read(walkFile);
  const w = readWalk(walkFile);
  if (w.review !== undefined && w.review !== null && !Array.isArray(w.review)) refuse("the walkthrough's review is not a list");
  const review = Array.isArray(w.review) ? w.review : [];
  if (fromFile !== undefined) {
    const earlier = readWalk(fromFile).review;
    if (earlier !== undefined && earlier !== null && !Array.isArray(earlier)) refuse("the walkthrough's review is not a list");
    if (Array.isArray(earlier)) {
      const isNum = r => r !== null && typeof r === "object" && typeof r.round === "number";
      const held = new Set(review.filter(isNum).map(r => r.round));
      const texts = new Set(review.map(r => JSON.stringify(r)));
      for (const r of earlier) {
        if (isNum(r) ? held.has(r.round) : texts.has(JSON.stringify(r))) continue;
        review.push(r);
      }
    }
  }
  const old = review.find(r => r && r.round === round);
  const entry = {
    round, verdict: v.verdict, head,
    findings: v.findings.map(f => {
      const made = { level: f.level, file: f.file, line: f.line, what: `${f.what} — ${f.why}` };
      const kept = old && Array.isArray(old.findings) ? old.findings.find(o => o && typeof o === "object" && sameFinding(o, made) && typeof o.fix === "string" && o.fix !== "") : undefined;
      return { ...made, fix: kept ? kept.fix : "" };
    }),
  };
  const rest = review.filter(r => !(r && r.round === round));
  rest.push(entry);
  const num = r => r && typeof r.round === "number";
  w.review = rest.sort((a, b) => (num(a) && num(b) ? a.round - b.round : num(a) ? -1 : num(b) ? 1 : 0));
  const text = "window.HUB_WALK = " + JSON.stringify(w, null, 1) + ";\n";
  if (text === before) return;
  const tmp = `${walkFile}.${process.pid}.tmp`;
  tmps.push(tmp);
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, walkFile);
  } catch (e) { refuse(`${walkFile} cannot be written (${e.code || e.message})`); }
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const known = { check: [], record: ["--round", "--head", "--from"], reply: ["--except"] };
  if (!known[cmd]) return refuse("usage: verdict.cjs check|record|reply <verdict file> ...");
  const pos = [], opt = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith("--")) { pos.push(rest[i]); continue; }
    if (!known[cmd].includes(rest[i]) || i + 1 >= rest.length || opt[rest[i]] !== undefined) return refuse(`unusable option ${rest[i]}`);
    opt[rest[i]] = rest[++i];
  }
  if (pos.length !== (cmd === "record" ? 2 : 1)) return refuse(`usage: verdict.cjs ${cmd} <verdict file>${cmd === "record" ? " <walkthrough file> --round <n> --head <sha> [--from <file>]" : ""}`);
  const v = parseVerdict(pos[0]);
  const lines = v.blocking.map((f, i) => show(f, i + 1));

  if (cmd === "record") {
    if (!/^[1-9]\d*$/.test(opt["--round"] || "")) refuse("--round must be an integer of 1 or more");
    if (!/^[0-9a-f]{7,40}$/.test(opt["--head"] || "")) refuse("--head must be 7 to 40 lowercase hex digits");
    record(v, pos[1], Number(opt["--round"]), opt["--head"], opt["--from"]);
  }
  if (cmd === "reply") {
    let skip = [];
    if (opt["--except"] !== undefined) {
      skip = opt["--except"].split(",").map(s => (/^[1-9]\d*$/.test(s) ? Number(s) : NaN));
      if (skip.some(n => !(n <= lines.length))) refuse(`--except must name numbers from 1 to ${lines.length}`);
    }
    const kept = lines.filter((_, i) => !skip.includes(i + 1));
    if (!kept.length) refuse("no blocking finding is left to send");
    console.log(["REVIEW:", ...kept].join("\n"));
    return;
  }
  console.log([`ok: ${v.verdict}, ${v.blocking.length} blocking, ${v.findings.length - v.blocking.length} non-blocking`, ...lines].join("\n"));
}

try { main(); }
catch (e) { refuse(`unexpected (${e && e.message})`); }
