#!/usr/bin/env node

import { createRequire } from 'node:module';
import { fixRules } from '../lib/fix-rules.js';
import {
    assertToolNodeVersion,
    normalizeRuntimeError,
} from '../lib/runtime.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const usage = `Usage: eslint-rule-specific-fix --rule <rule> [--rule <rule> ...] <files...>

Apply ESLint fixes only for the specified rules.

Options:
  -r, --rule <rule>  Rule ID whose fixes may be applied (repeatable)
      --dry-run      Compute fixes without writing files
      --json         Print a JSON summary to stdout
  -h, --help         Show this help
  -v, --version      Show the package version
  --                 Treat all remaining arguments as file patterns`;

export function parseArguments(args) {
    const rules = new Set();
    const files = [];
    let positionalOnly = false;
    let dryRun = false;
    let json = false;

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
        } else if (argument === '--dry-run') {
            dryRun = true;
        } else if (argument === '--json') {
            json = true;
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

    return { action: 'lint', files, rules, dryRun, json };
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

    const report = await fixRules(options.files, {
        rules: options.rules,
        write: !options.dryRun,
    });

    if (options.json) {
        console.log(JSON.stringify(report.summary, null, 2));
    } else if (report.reportableResults.length > 0) {
        const { ESLint } = await import('eslint');
        const eslint = new ESLint();
        const formatter = await eslint.loadFormatter('stylish');
        console.error(await formatter.format(report.reportableResults));
    }

    process.exitCode = report.exitCode;
}

function reportExpectedRuntimeError(error) {
    console.error(error.message);
    process.exitCode = 2;
}

function reportUnexpectedError(error) {
    const normalized = normalizeRuntimeError(error);

    if (normalized !== error) {
        reportExpectedRuntimeError(normalized);
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
    assertToolNodeVersion();
    main().catch(reportUnexpectedError);
} catch (error) {
    reportExpectedRuntimeError(error);
}
