import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve('bin/eslint-rule-specific-fix.js');

async function createDirectoryFixture() {
    const directory = await mkdtemp(path.join(tmpdir(), 'eslint-rule-specific-fix-filters-'));
    const source = 'const value = 1\n';

    await writeFile(
        path.join(directory, 'eslint.config.mjs'),
        'export default [{ rules: { semi: ["error", "always"] } }];\n',
    );
    await writeFile(path.join(directory, 'keep.js'), source);
    await writeFile(path.join(directory, 'skip.js'), source);
    await mkdir(path.join(directory, 'src'));
    await writeFile(path.join(directory, 'src', 'extra.mjs'), source);
    await writeFile(path.join(directory, 'src', 'extra.js'), source);

    return { directory, source };
}

function runCli(args, options) {
    return execFileAsync(process.execPath, [cliPath, ...args], {
        timeout: 15_000,
        ...options,
    });
}

function runCliWithStdin(args, input, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cliPath, ...args], { cwd });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error('CLI stdin test timed out'));
        }, 15_000);

        child.stdout.on('data', chunk => {
            stdout += chunk;
        });
        child.stderr.on('data', chunk => {
            stderr += chunk;
        });
        child.on('error', error => {
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', code => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
        });
        child.stdin.end(input);
    });
}

test('limits directory scans with --ext', async () => {
    const { directory, source } = await createDirectoryFixture();

    await runCli(['--ext', '.mjs', '--rule', 'semi', 'src'], { cwd: directory });

    assert.equal(await readFile(path.join(directory, 'src', 'extra.mjs'), 'utf8'), 'const value = 1;\n');
    assert.equal(await readFile(path.join(directory, 'src', 'extra.js'), 'utf8'), source);
});

test('skips files matched by --ignore-pattern', async () => {
    const { directory, source } = await createDirectoryFixture();

    await runCli(
        ['--ignore-pattern', 'skip.js', '--rule', 'semi', 'keep.js', 'skip.js'],
        { cwd: directory },
    );

    assert.equal(await readFile(path.join(directory, 'keep.js'), 'utf8'), 'const value = 1;\n');
    assert.equal(await readFile(path.join(directory, 'skip.js'), 'utf8'), source);
});

test('reads a file list from stdin', async () => {
    const { directory } = await createDirectoryFixture();
    const result = await runCliWithStdin(
        ['--stdin', '--rule', 'semi'],
        'keep.js\n# ignored\nskip.js\n',
        directory,
    );

    assert.equal(result.code, 0);
    assert.equal(await readFile(path.join(directory, 'keep.js'), 'utf8'), 'const value = 1;\n');
    assert.equal(await readFile(path.join(directory, 'skip.js'), 'utf8'), 'const value = 1;\n');
});
