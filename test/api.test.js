import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { expandFilesWithExtensions, parseExtensions, parseStdinFileList } from '../lib/file-filters.js';
import { fixRules } from '../index.js';

async function createFixture(source, rules) {
    const directory = await mkdtemp(path.join(tmpdir(), 'eslint-rule-specific-fix-api-'));

    await writeFile(
        path.join(directory, 'eslint.config.mjs'),
        `export default [{ rules: ${JSON.stringify(rules)} }];\n`,
    );
    await writeFile(path.join(directory, 'fixture.js'), source);

    return directory;
}

test('fixRules applies only selected-rule fixes and returns a report', async () => {
    const directory = await createFixture('const value = "text"\n', {
        quotes: ['error', 'single'],
        semi: ['error', 'always'],
    });

    const report = await fixRules(['fixture.js'], {
        rules: ['semi'],
        cwd: directory,
    });

    assert.equal(report.exitCode, 0);
    assert.deepEqual(report.rules, ['semi']);
    assert.equal(report.summary.written, true);
    assert.equal(report.summary.changedFileCount, 1);
    assert.equal(
        await readFile(path.join(directory, 'fixture.js'), 'utf8'),
        'const value = "text";\n',
    );
});

test('fixRules accepts a single rule string', async () => {
    const directory = await createFixture('const value = "text"\n', {
        semi: ['error', 'always'],
    });

    const report = await fixRules('fixture.js', {
        rules: 'semi',
        cwd: directory,
    });

    assert.equal(report.exitCode, 0);
    assert.deepEqual(report.rules, ['semi']);
});

test('fixRules rejects invalid and empty file patterns', async () => {
    await assert.rejects(
        fixRules(undefined, { rules: ['semi'] }),
        /At least one file pattern is required/,
    );
    await assert.rejects(
        fixRules([null], { rules: ['semi'] }),
        /At least one file pattern is required/,
    );
});

test('fixRules can compute fixes without writing files', async () => {
    const source = 'const value = "text"\n';
    const directory = await createFixture(source, {
        semi: ['error', 'always'],
    });

    const report = await fixRules(['fixture.js'], {
        rules: 'semi',
        cwd: directory,
        write: false,
    });

    assert.equal(report.exitCode, 0);
    assert.equal(report.summary.written, false);
    assert.equal(report.summary.changedFileCount, 1);
    assert.equal(await readFile(path.join(directory, 'fixture.js'), 'utf8'), source);
});

test('fixRules honors extra ignore patterns', async () => {
    const source = 'const value = 1\n';
    const directory = await createFixture(source, {
        semi: ['error', 'always'],
    });
    await writeFile(path.join(directory, 'skip.js'), source);

    const report = await fixRules(['fixture.js', 'skip.js'], {
        rules: 'semi',
        cwd: directory,
        ignorePatterns: ['skip.js'],
    });

    assert.equal(report.exitCode, 0);
    assert.equal(await readFile(path.join(directory, 'fixture.js'), 'utf8'), 'const value = 1;\n');
    assert.equal(await readFile(path.join(directory, 'skip.js'), 'utf8'), source);
});

test('parses extension and stdin file lists', () => {
    assert.deepEqual(parseExtensions(['js,.mjs', '.cjs']), ['.js', '.mjs', '.cjs']);
    assert.deepEqual(expandFilesWithExtensions(['src'], ['.js', '.mjs']), ['src/**/*{.js,.mjs}']);
    assert.deepEqual(parseStdinFileList('a.js\n# comment\n\nb.js\n'), ['a.js', 'b.js']);
});

test('expands existing dotted directories for --ext', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'eslint-rule-specific-fix-ext-'));
    const dotted = path.join(directory, 'src.v1');
    await mkdir(dotted);

    assert.deepEqual(
        expandFilesWithExtensions([dotted], ['.js']),
        [`${dotted}/**/*.js`],
    );
});

test('preserves existing extensionless files for --ext', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'eslint-rule-specific-fix-makefile-'));
    const makefile = path.join(directory, 'Makefile');
    await writeFile(makefile, 'all:\n');

    assert.deepEqual(expandFilesWithExtensions([makefile], ['.js']), [makefile]);
});

test('fixRules reports remaining selected-rule violations', async () => {
    const directory = await createFixture('debugger;\n', {
        'no-debugger': 'error',
    });

    const report = await fixRules(['fixture.js'], {
        rules: new Set(['no-debugger']),
        cwd: directory,
    });

    assert.equal(report.exitCode, 1);
    assert.equal(report.reportableResults.length, 1);
    assert.equal(report.reportableResults[0].messages[0].ruleId, 'no-debugger');
});
