import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const minimumNodeVersion = '18.18.0';
export const eslint10NodeRequirement = 'Node.js ^20.19.0 || ^22.13.0 || >=24.0.0';

export function parseVersion(version) {
    const [major = 0, minor = 0, patch = 0] = String(version)
        .replace(/^v/, '')
        .split('.')
        .map(part => Number.parseInt(part, 10) || 0);

    return { major, minor, patch };
}

export function supportsNodeVersion(version) {
    const { major, minor } = parseVersion(version);

    return major > 18 || (major === 18 && minor >= 18);
}

export function supportsEslint10NodeVersion(version) {
    const { major, minor } = parseVersion(version);

    if (major === 20) {
        return minor >= 19;
    }

    if (major === 22) {
        return minor >= 13;
    }

    return major >= 24;
}

export function readInstalledEslintVersion() {
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

export function assertToolNodeVersion() {
    if (!supportsNodeVersion(process.versions.node)) {
        throw new Error(
            `Error: eslint-rule-specific-fix requires Node.js >=${minimumNodeVersion}\n` +
            `Current version: ${process.version}\n\n` +
            'Please upgrade Node.js and run the command again.\n' +
            `Supported versions: Node.js >=${minimumNodeVersion}`,
        );
    }
}

export function assertEslintCompatibility() {
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

export function isMissingFlatConfigError(error) {
    return error instanceof Error && error.message === 'Could not find config file.';
}

export function formatMissingFlatConfigError() {
    return (
        'Error: ESLint could not find a flat config file (eslint.config.js, eslint.config.mjs, or eslint.config.cjs).\n' +
        'ESLint 9+ uses flat config only; ESLint 10 no longer reads .eslintrc.* files.\n\n' +
        'Add an eslint.config.js in the project root, or run the command from the directory that contains one.'
    );
}

export function normalizeRuntimeError(error) {
    if (isMissingFlatConfigError(error)) {
        return new Error(formatMissingFlatConfigError());
    }

    return error;
}
