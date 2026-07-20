import {
  BUN_SMOL_REEXEC_SENTINEL,
  ensureBunSmolRuntime,
} from '../fixtures/lib/bun-smol-runtime.mjs';

ensureBunSmolRuntime(import.meta.url);
process.stdout.write(`${JSON.stringify({
  execArgv: process.execArgv,
  scriptArguments: process.argv.slice(2),
  sentinel: process.env[BUN_SMOL_REEXEC_SENTINEL] ?? null,
})}\n`);
