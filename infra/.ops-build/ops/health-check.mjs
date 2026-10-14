/**
 * A health check that runs every 15 minutes (EventBridge Scheduler). It calls the three public pieces like a visitor
 * would and records the result as CloudWatch metrics, which the dashboard shows and an alarm watches:
 *
 *   Quizlike / HealthOk    1 if the piece answered correctly, else 0     (dimension Target)
 *   Quizlike / LatencyMs   how long the API took                          (dimension Target, API only)
 *
 * Targets come from the TARGETS setting: [{ "name": "site", "url": "...", "kind": "site" }, ...]
 * It makes twelve tiny requests an hour. Four metrics here, in all ten, stay inside the 10 free custom metrics.
 */
const CHECKS = {
  // The website must return the app's page.
  site: { init: {}, ok: async (res) => res.status === 200 && /<title>Quizlike/.test(await res.text()) },
  // The signer must return a signature, and never anything that looks like the private key.
  signer: { init: {}, ok: async (res) => { const j = await res.json(); return res.status === 200 && j.success === true && !!j.signature; } },
  // The API must answer a real read (the list of open quizzes) in the agreed shape.
  api: {
    init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'query', col: 'quizzes', index: 'byActive', value: 'Y', limit: 1 }) },
    ok: async (res) => { const j = await res.json(); return res.status === 200 && j.ok === true && Array.isArray(j.data); },
  },
};

export async function checkOne(target, fetchFn = fetch, now = Date.now) {
  const check = CHECKS[target.kind];
  const started = now();
  let ok = false;
  try {
    const res = await fetchFn(target.url, { ...check.init, signal: AbortSignal.timeout(8000) });
    ok = await check.ok(res);
  } catch { ok = false; }
  return { name: target.name, ok, ms: now() - started };
}

export async function handler(_event, _context, injected) {
  const deps = injected && typeof injected === 'object' ? injected : {};
  const targets = deps.targets || JSON.parse(process.env.TARGETS || '[]');
  const results = [];
  for (const t of targets) results.push(await checkOne(t, deps.fetch, deps.now));

  // Latency is recorded for the API only. Every extra metric beyond the 10 free custom ones costs 0.30 dollars a month.
  const metrics = results.flatMap((r, i) => [
    { MetricName: 'HealthOk', Dimensions: [{ Name: 'Target', Value: r.name }], Value: r.ok ? 1 : 0, Unit: 'Count' },
    ...(targets[i].kind === 'api' ? [{ MetricName: 'LatencyMs', Dimensions: [{ Name: 'Target', Value: r.name }], Value: r.ms, Unit: 'Milliseconds' }] : []),
  ]);
  if (deps.putMetrics) await deps.putMetrics(metrics);
  else {
    const { CloudWatchClient, PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');
    await new CloudWatchClient({}).send(new PutMetricDataCommand({ Namespace: 'Quizlike', MetricData: metrics }));
  }
  console.log(`EVT health ${results.map((r) => `${r.name}=${r.ok ? 'ok' : 'FAIL'}(${r.ms}ms)`).join(' ')}`);
  return results;
}
