import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve('bin/eslint-rule-specific-fix.js');

async function createFixture(source, rules) {
    const directory = await mkdtemp(path.join(tmpdir(), 'eslint-rule-specific-fix-'));

    await writeFile(
        path.join(directory, 'eslint.config.mjs'),
        `export default [{ rules: ${JSON.stringify(rules)} }];\n`,
    );
    await writeFile(path.join(directory, 'fixture.js'), source);

    return directory;
}

test('fixes only the selected rule', async () => {
    const directory = await createFixture('const value = "text"\n', {
        quotes: ['error', 'single'],
        semi: ['error', 'always'],
    });

    const result = await execFileAsync(
        process.execPath,
        [cliPath, '--rule', 'semi', 'fixture.js'],
        { cwd: directory },
    );

    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.equal(await readFile(path.join(directory, 'fixture.js'), 'utf8'), 'const value = "text";\n');
});

test('supports repeated rules and --rule=<rule>', async () => {
    const directory = await createFixture('const value = "text"\n', {
        quotes: ['error', 'single'],
        semi: ['error', 'always'],
    });

    await execFileAsync(
        process.execPath,
        [cliPath, '--rule=semi', '--rule', 'quotes', 'fixture.js'],
        { cwd: directory },
    );

    assert.equal(await readFile(path.join(directory, 'fixture.js'), 'utf8'), "const value = 'text';\n");
});

test('returns 1 when a selected rule cannot be fixed', async () => {
    const directory = await createFixture('debugger;\n', {
        'no-debugger': 'error',
    });

    await assert.rejects(
        execFileAsync(
            process.execPath,
            [cliPath, '--rule', 'no-debugger', 'fixture.js'],
            { cwd: directory },
        ),
        error => {
            assert.equal(error.code, 1);
            assert.match(error.stderr, /no-debugger/);
            return true;
        },
    );
});

test('returns 2 for invalid arguments', async () => {
    await assert.rejects(
        execFileAsync(process.execPath, [cliPath, '--rule']),
        error => {
            assert.equal(error.code, 2);
            assert.match(error.stderr, /requires a rule ID/);
            return true;
        },
    );
});
