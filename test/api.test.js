import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
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

test('fixRules rejects empty file patterns and character-split rules', async () => {
    await assert.rejects(
        fixRules(undefined, { rules: ['semi'] }),
        /At least one file pattern is required/,
    );
    await assert.rejects(
        fixRules([null], { rules: ['semi'] }),
        /At least one file pattern is required/,
    );
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
