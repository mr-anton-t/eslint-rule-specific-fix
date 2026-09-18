#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');
const minimumNodeVersion = '18.18.0';
const eslint10NodeRequirement = 'Node.js ^20.19.0 || ^22.13.0 || >=24.0.0';

const usage = `Usage: eslint-rule-specific-fix --rule <rule> [--rule <rule> ...] <files...>

Apply ESLint fixes only for the specified rules.

Options:
  -r, --rule <rule>  Rule ID whose fixes may be applied (repeatable)
  -h, --help         Show this help
  -v, --version      Show the package version
  --                 Treat all remaining arguments as file patterns`;

function parseVersion(version) {
    const [major = 0, minor = 0, patch = 0] = String(version)
        .replace(/^v/, '')
        .split('.')
        .map(part => Number.parseInt(part, 10) || 0);

    return { major, minor, patch };
}

function supportsNodeVersion(version) {
    const { major, minor } = parseVersion(version);

    return major > 18 || (major === 18 && minor >= 18);
}

function supportsEslint10NodeVersion(version) {
    const { major, minor } = parseVersion(version);

    if (major === 20) {
        return minor >= 19;
    }

    if (major === 22) {
        return minor >= 13;
    }

    return major >= 24;
}

function readInstalledEslintVersion() {
    try {
        return require('eslint/package.json').version;
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            throw new Error(
                'Error: ESLint is not installed next to eslint-rule-specific-fix.\n' +
                'Install it in this project:\n\n' +
                '    npm install --save-dev eslint',
            );
        }

        throw error;
    }
}

function assertRuntimeCompatibility() {
    if (!supportsNodeVersion(process.versions.node)) {
        throw new Error(
            `Error: eslint-rule-specific-fix requires Node.js >=${minimumNodeVersion}\n` +
            `Current version: ${process.version}\n\n` +
            'Please upgrade Node.js and run the command again.\n' +
            `Supported versions: Node.js >=${minimumNodeVersion}`,
        );
    }

    const eslintVersion = readInstalledEslintVersion();
    const { major } = parseVersion(eslintVersion);

    if (major >= 10 && !supportsEslint10NodeVersion(process.versions.node)) {
        throw new Error(
            `Error: ESLint ${eslintVersion} requires ${eslint10NodeRequirement}.\n` +
            `Current version: ${process.version}\n\n` +
            'ESLint 10 dropped support for Node.js 18 and other unmaintained releases.\n' +
            'Upgrade Node.js, or use ESLint 9 with Node.js >=18.18.0.',
        );
    }
}

function isMissingFlatConfigError(error) {
    return error instanceof Error && error.message === 'Could not find config file.';
}

function formatMissingFlatConfigError() {
    return (
        'Error: ESLint could not find a flat config file (eslint.config.js, eslint.config.mjs, or eslint.config.cjs).\n' +
        'ESLint 9+ uses flat config only; ESLint 10 no longer reads .eslintrc.* files.\n\n' +
        'Add an eslint.config.js in the project root, or run the command from the directory that contains one.'
    );
}


function parseArguments(args) {
    const rules = new Set();
    const files = [];
    let positionalOnly = false;

    for (let index = 0; index < args.length; index++) {
        const argument = args[index];

        if (positionalOnly) {
            files.push(argument);
        } else if (argument === '--') {
            positionalOnly = true;
        } else if (argument === '--rule' || argument === '-r') {
            const rule = args[++index];

            if (!rule || rule.startsWith('-')) {
                throw new Error(`${argument} requires a rule ID`);
            }

            rules.add(rule);
        } else if (argument.startsWith('--rule=')) {
            const rule = argument.slice('--rule='.length);

            if (!rule) {
                throw new Error('--rule requires a rule ID');
            }

            rules.add(rule);
        } else if (argument === '--help' || argument === '-h') {
            return { action: 'help' };
        } else if (argument === '--version' || argument === '-v') {
            return { action: 'version' };
        } else if (argument.startsWith('-')) {
            throw new Error(`Unknown option: ${argument}`);
        } else {
            files.push(argument);
        }
    }

    if (rules.size === 0 || files.length === 0) {
        throw new Error('At least one rule and one file pattern are required');
    }

    return { action: 'lint', files, rules };
}

function filterResults(results, predicate) {
    return results
        .map(result => {
            const messages = result.messages.filter(predicate);

            return {
                ...result,
                messages,
                errorCount: messages.filter(message => message.severity === 2).length,
                warningCount: messages.filter(message => message.severity === 1).length,
                fatalErrorCount: messages.filter(message => message.fatal).length,
                fixableErrorCount: messages.filter(message => message.severity === 2 && message.fix).length,
                fixableWarningCount: messages.filter(message => message.severity === 1 && message.fix).length,
            };
        })
        .filter(result => result.messages.length > 0);
}

async function main() {
    let options;

    try {
        options = parseArguments(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        console.error(`\n${usage}`);
        process.exitCode = 2;
        return;
    }

    if (options.action === 'help') {
        console.log(usage);
        return;
    }

    if (options.action === 'version') {
        console.log(packageJson.version);
        return;
    }

    const { ESLint } = await import('eslint');
    const eslint = new ESLint({
        fix: message => options.rules.has(message.ruleId),
    });
    const results = await eslint.lintFiles(options.files);

    await ESLint.outputFixes(results);

    const hasFatalMessage = results.some(result =>
        result.messages.some(message => message.fatal),
    );
    const reportableResults = filterResults(
        results,
        message => message.fatal || options.rules.has(message.ruleId),
    );

    if (hasFatalMessage) {
        const formatter = await eslint.loadFormatter('stylish');
        console.error(await formatter.format(reportableResults));
        process.exitCode = 2;
        return;
    }

    if (reportableResults.length > 0) {
        const formatter = await eslint.loadFormatter('stylish');
        console.error(await formatter.format(reportableResults));
        process.exitCode = 1;
    }
}

function reportExpectedRuntimeError(error) {
    console.error(error.message);
    process.exitCode = 2;
}

function reportUnexpectedError(error) {
    if (isMissingFlatConfigError(error)) {
        reportExpectedRuntimeError(new Error(formatMissingFlatConfigError()));
        return;
    }

    const details = error instanceof Error ? error.stack ?? error.message : String(error);

    console.error(details);
    console.error(
        '\neslint-rule-specific-fix encountered an unexpected error.\n' +
        'Please report this issue:\n' +
        'https://github.com/mr-anton-t/eslint-rule-specific-fix/issues/new\n\n' +
        'AI-generated issue reports are welcome.\n' +
        'A reproducible example and the complete error log are required.',
    );
    process.exitCode = 2;
}

try {
    assertRuntimeCompatibility();
    main().catch(reportUnexpectedError);
} catch (error) {
    reportExpectedRuntimeError(error);
}
