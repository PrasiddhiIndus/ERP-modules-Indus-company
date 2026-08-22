/**
 * Serialize all Windows DSC PowerShell work (list certs + sign PDF).
 * Concurrent HyperPKI/CSP access causes intermittent "token not detected" and UI lag.
 */

let chain = Promise.resolve();

export function withDscLock(fn) {
  const run = chain.then(() => fn(), () => fn());
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
