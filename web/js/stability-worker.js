// Robustness check in a background thread, so the page stays responsive (see stabilityRunner in model.js).
// Only the latest choice matters: queued jobs for an older choice are dropped when a new one arrives.
import { buildModel, stabilityRunner } from './model.js';

let model = null, queue = [], busy = false;
// A MessageChannel tick (unlike setTimeout) is not throttled in background tabs, and it runs after
// every message already waiting, so stale jobs get pruned first.
const tick = new MessageChannel();
tick.port1.onmessage = () => next();
const later = () => tick.port2.postMessage(0);
self.onmessage = (e) => {
  const m = e.data;
  if (m.init) { model = buildModel(m.meta, m.bin); return; }
  queue = queue.filter((j) => j.sig === m.sig);
  queue.push(m);
  if (!busy) { busy = true; later(); }
};
function next() {
  const job = queue.shift();
  if (!job) { busy = false; return; }
  const runner = stabilityRunner(model, job.prof, job.weights, job.cells);
  while (!runner.step()) { /* run all re-scorings */ }
  self.postMessage({ sig: job.sig, result: [...runner.result()] });
  later(); // lets newer messages arrive (and prune the queue) before the next job
}
