import { assertEslintCompatibility } from './runtime.js';

function toRuleSet(rules) {
    let ruleList;

    if (rules instanceof Set) {
        ruleList = [...rules];
    } else if (typeof rules === 'string') {
        ruleList = [rules];
    } else if (Array.isArray(rules)) {
        ruleList = rules;
    } else {
        ruleList = [];
    }

    if (ruleList.some(rule => typeof rule !== 'string' || rule.length === 0)) {
        throw new Error('At least one rule is required');
    }

    const ruleSet = new Set(ruleList);

    if (ruleSet.size === 0) {
        throw new Error('At least one rule is required');
    }

    return ruleSet;
}

function toFileList(files) {
    const fileList = Array.isArray(files)
        ? files
        : files === undefined || files === null
            ? []
            : [files];

    if (fileList.length === 0 || fileList.some(file => typeof file !== 'string' || file.length === 0)) {
        throw new Error('At least one file pattern is required');
    }

    return fileList;
}

export function filterResults(results, predicate) {
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

export async function fixRules(files, options = {}) {
    const fileList = toFileList(files);
    const rules = toRuleSet(options.rules);
    assertEslintCompatibility();

    const { ESLint } = await import('eslint');
    const eslintOptions = { ...options.eslintOptions };

    if (options.cwd) {
        eslintOptions.cwd = options.cwd;
    }

    eslintOptions.fix = message => rules.has(message.ruleId);
    const eslint = new ESLint(eslintOptions);
    const results = await eslint.lintFiles(fileList);

    if (options.write !== false) {
        await ESLint.outputFixes(results);
    }

    const hasFatalMessage = results.some(result =>
        result.messages.some(message => message.fatal),
    );
    const reportableResults = filterResults(
        results,
        message => message.fatal || rules.has(message.ruleId),
    );
    const exitCode = hasFatalMessage ? 2 : reportableResults.length > 0 ? 1 : 0;

    return {
        results,
        reportableResults,
        hasFatalMessage,
        exitCode,
        rules: [...rules],
        files: fileList,
    };
}
