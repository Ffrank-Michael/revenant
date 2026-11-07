// Is the watcher alive?   npx tsx scripts/watch-status.ts BUBBLES
import fs from "node:fs";
const name = process.argv[2] ?? "BUBBLES";
try {
  const a = JSON.parse(fs.readFileSync(`data/watch/${name}-alive.json`, "utf8"));
  if (a.stopped) { console.log(`STOPPED: ${a.reason} at ${a.at}`); process.exit(0); }
  let running = true;
  try { process.kill(a.pid, 0); } catch { running = false; }
  const lateMin = (Date.now() - Date.parse(a.nextCheckAt)) / 60000;
  const ok = running && lateMin < 5;
  console.log(`${ok ? "ALIVE" : "NOT HEALTHY"}: process ${a.pid} ${running ? "is running" : "is NOT running"}; last check ${a.lastCheckAt} (${a.lastVerdict}, via ${a.via}); next due ${a.nextCheckAt}${lateMin > 0 ? ` (${lateMin.toFixed(0)} min overdue)` : ""}; stops by ${a.stopsAt}`);
  process.exit(ok ? 0 : 1);
} catch { console.log("no heartbeat file yet: the watcher has not completed a check"); process.exit(1); }
