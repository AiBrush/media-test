import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

import { BUN_SMOL_REEXEC_SENTINEL } from '../fixtures/lib/bun-smol-runtime.mjs';

describe('fixture baker bounded-memory runtime', () => {
  test('default launch re-execs once under --smol and preserves script arguments', () => {
    const result = run(['tests/bun-smol-runtime-child.mjs', 'alpha', 'β']);
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    expect(report.execArgv.filter((value: string) => value === '--smol')).toHaveLength(1);
    expect(report.scriptArguments).toEqual(['alpha', 'β']);
    expect(report.sentinel).toBeNull();
  });

  test('an already-small launch does not recurse and a stale marker fails closed', () => {
    const direct = run(['--smol', 'tests/bun-smol-runtime-child.mjs', 'direct']);
    expect(direct.status, direct.stderr).toBe(0);
    expect(JSON.parse(direct.stdout.trim())).toMatchObject({
      scriptArguments: ['direct'],
      sentinel: null,
    });

    const guarded = run(['tests/bun-smol-runtime-child.mjs'], {
      [BUN_SMOL_REEXEC_SENTINEL]: '1',
    });
    expect(guarded.status).not.toBe(0);
    expect(guarded.stderr).toContain('--smol re-exec loop guard');
  });

  test('both real main entrypoints are wired before their CLI and tool initialization', () => {
    for (const entrypoint of ['fixtures/bake.mjs', 'fixtures/bake-scenario-goldens.mjs']) {
      const help = run([entrypoint, '--help']);
      expect(help.status, `${entrypoint}: ${help.stderr}`).toBe(0);
      expect(help.stdout).toContain(entrypoint);

      const guarded = run([entrypoint, '--help'], { [BUN_SMOL_REEXEC_SENTINEL]: '1' });
      expect(guarded.status).not.toBe(0);
      expect(guarded.stderr).toContain('--smol re-exec loop guard');
    }
  });
});

function run(arguments_: string[], extraEnvironment: Record<string, string> = {}) {
  const environment = { ...process.env, ...extraEnvironment };
  if (!(BUN_SMOL_REEXEC_SENTINEL in extraEnvironment)) delete environment[BUN_SMOL_REEXEC_SENTINEL];
  return spawnSync(process.execPath, arguments_, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 20_000,
    env: environment,
  });
}
