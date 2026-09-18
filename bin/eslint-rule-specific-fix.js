#!/usr/bin/env node

import { ESLint } from 'eslint';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const usage = `Usage: eslint-rule-specific-fix --rule <rule> [--rule <rule> ...] <files...>

Apply ESLint fixes only for the specified rules.

Options:
  -r, --rule <rule>  Rule ID whose fixes may be applied (repeatable)
  -h, --help         Show this help
  -v, --version      Show the package version
  --                 Treat all remaining arguments as file patterns`;

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

    const eslint = new ESLint({
        fix: message => options.rules.has(message.ruleId),
    });
    const results = await eslint.lintFiles(options.files);

    await ESLint.outputFixes(results);

    const remainingResults = results
        .map(result => {
            const messages = result.messages.filter(message => options.rules.has(message.ruleId));

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

    if (remainingResults.length > 0) {
        const formatter = await eslint.loadFormatter('stylish');
        console.error(await formatter.format(remainingResults));
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 2;
});
