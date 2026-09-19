import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const cliPath = path.resolve('bin/eslint-rule-specific-fix.js');
const installedEslintMajor = Number.parseInt(require('eslint/package.json').version.split('.')[0], 10);

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

test('returns 2 and reports fatal and selected-rule diagnostics', async () => {
    const directory = await createFixture('const value = ;\n', {
        'no-debugger': 'error',
    });
    await writeFile(path.join(directory, 'selected-rule.js'), 'debugger;\n');

    await assert.rejects(
        execFileAsync(
            process.execPath,
            [cliPath, '--rule', 'no-debugger', 'fixture.js', 'selected-rule.js'],
            { cwd: directory },
        ),
        error => {
            assert.equal(error.code, 2);
            assert.match(error.stderr, /Parsing error/);
            assert.match(error.stderr, /no-debugger/);
            return true;
        },
    );
    assert.equal(await readFile(path.join(directory, 'fixture.js'), 'utf8'), 'const value = ;\n');
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

test('prints the original error and package support message for runtime errors', async () => {
    const directory = await createFixture('const value = 1;\n', {});

    await assert.rejects(
        execFileAsync(
            process.execPath,
            [cliPath, '--rule', 'semi', 'missing.js'],
            { cwd: directory },
        ),
        error => {
            assert.equal(error.code, 2);
            assert.match(error.stderr, /No files matching/);
            assert.match(error.stderr, /\n {4}at .+\n/);
            assert.match(error.stderr, /eslint-rule-specific-fix encountered an unexpected error/);
            assert.match(error.stderr, /github\.com\/mr-anton-t\/eslint-rule-specific-fix\/issues\/new/);
            assert.match(error.stderr, /AI-generated issue reports are welcome/);
            assert.match(error.stderr, /A reproducible example and the complete error log are required/);
            return true;
        },
    );
});

test('prints upgrade instructions before loading ESLint on unsupported Node.js', async () => {
    const cliUrl = pathToFileURL(cliPath).href;
    const loaderUrl = pathToFileURL(path.resolve('test-support/reject-eslint-loader.mjs')).href;
    const script = `
        Object.defineProperty(process.versions, 'node', { value: '16.20.2' });
        Object.defineProperty(process, 'version', { value: 'v16.20.2' });
        await import(${JSON.stringify(cliUrl)});
    `;

    await assert.rejects(
        execFileAsync(
            process.execPath,
            ['--experimental-loader', loaderUrl, '--input-type=module', '--eval', script],
        ),
        error => {
            assert.equal(error.code, 2);
            assert.doesNotMatch(error.stderr, /ESLint was loaded before/);
            assert.match(error.stderr, /requires Node\.js >=18\.18\.0/);
            assert.match(error.stderr, /Current version: v16\.20\.2/);
            assert.match(error.stderr, /Please upgrade Node\.js and run the command again/);
            assert.match(error.stderr, /Supported versions: Node\.js >=18\.18\.0/);
            return true;
        },
    );
});

test('explains that ESLint 10 cannot run on Node.js 18', { skip: installedEslintMajor < 10 }, async () => {
    const cliUrl = pathToFileURL(cliPath).href;
    const script = `
        Object.defineProperty(process.versions, 'node', { value: '18.18.2' });
        Object.defineProperty(process, 'version', { value: 'v18.18.2' });
        process.argv = [process.execPath, ${JSON.stringify(cliPath)}, '--rule', 'semi', 'fixture.js'];
        await import(${JSON.stringify(cliUrl)});
    `;

    await assert.rejects(
        execFileAsync(
            process.execPath,
            ['--input-type=module', '--eval', script],
        ),
        error => {
            assert.equal(error.code, 2);
            assert.match(error.stderr, /ESLint .+ requires Node\.js \^20\.19\.0 \|\| \^22\.13\.0 \|\| >=24\.0\.0/);
            assert.match(error.stderr, /Current version: v18\.18\.2/);
            assert.match(error.stderr, /ESLint 10 dropped support for Node\.js 18/);
            assert.match(error.stderr, /use ESLint 9 with Node\.js >=18\.18\.0/);
            assert.doesNotMatch(error.stderr, /unexpected error/);
            return true;
        },
    );
});


test('prints help without checking the installed ESLint version', { skip: installedEslintMajor < 10 }, async () => {
    const cliUrl = pathToFileURL(cliPath).href;
    const script = `
        Object.defineProperty(process.versions, 'node', { value: '18.18.2' });
        Object.defineProperty(process, 'version', { value: 'v18.18.2' });
        process.argv = [process.execPath, ${JSON.stringify(cliPath)}, '--help'];
        await import(${JSON.stringify(cliUrl)});
    `;

    const result = await execFileAsync(
        process.execPath,
        ['--input-type=module', '--eval', script],
    );

    assert.match(result.stdout, /Usage: eslint-rule-specific-fix/);
    assert.doesNotMatch(result.stderr, /ESLint .+ requires Node\.js/);
});

test('explains when a flat config file is missing', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'eslint-rule-specific-fix-noconfig-'));
    await writeFile(path.join(directory, 'fixture.js'), 'const value = 1;\n');

    await assert.rejects(
        execFileAsync(
            process.execPath,
            [cliPath, '--rule', 'semi', 'fixture.js'],
            { cwd: directory },
        ),
        error => {
            assert.equal(error.code, 2);
            assert.match(error.stderr, /could not find a flat config file/i);
            assert.match(error.stderr, /eslint\.config\.js/);
            assert.match(error.stderr, /no longer reads \.eslintrc/);
            assert.doesNotMatch(error.stderr, /unexpected error/);
            return true;
        },
    );
});

test('does not write files in dry-run mode', async () => {
    const source = 'const value = "text"\n';
    const directory = await createFixture(source, {
        semi: ['error', 'always'],
    });

    const result = await execFileAsync(
        process.execPath,
        [cliPath, '--dry-run', '--rule', 'semi', 'fixture.js'],
        { cwd: directory },
    );

    assert.equal(result.stdout, '');
    assert.equal(await readFile(path.join(directory, 'fixture.js'), 'utf8'), source);
});

test('prints a JSON summary', async () => {
    const directory = await createFixture('const value = "text"\n', {
        semi: ['error', 'always'],
    });

    const result = await execFileAsync(
        process.execPath,
        [cliPath, '--dry-run', '--json', '--rule', 'semi', 'fixture.js'],
        { cwd: directory },
    );

    assert.deepEqual(JSON.parse(result.stdout), {
        written: false,
        changedFileCount: 1,
        remainingSelectedCount: 0,
        fatalCount: 0,
    });
});
