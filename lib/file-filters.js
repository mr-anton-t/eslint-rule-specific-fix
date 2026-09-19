import fs from 'node:fs';
import path from 'node:path';

export function parseExtensions(values) {
    return values.flatMap(value => value.split(','))
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => value.startsWith('.') ? value : `.${value}`);
}

function statArgument(file) {
    try {
        return fs.statSync(file);
    } catch {
        return null;
    }
}

export function expandFilesWithExtensions(files, extensions) {
    if (extensions.length === 0) {
        return files;
    }

    return files.flatMap(file => {
        if (/[*?[{]/.test(file)) {
            return [file];
        }

        const stats = statArgument(file);

        if (stats?.isFile() || (!stats && path.extname(file))) {
            return [file];
        }

        const base = file.replace(/[/\\]+$/, '') || '.';
        const suffix = extensions.length === 1
            ? `*${extensions[0]}`
            : `*{${extensions.join(',')}}`;

        return [`${base}/**/${suffix}`];
    });
}

export function parseStdinFileList(text) {
    return String(text)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
}

export function mergeOverrideIgnores(eslintOptions, ignorePatterns) {
    if (ignorePatterns.length === 0) {
        return eslintOptions;
    }

    const existing = eslintOptions.overrideConfig;
    const overrideConfig = [
        ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
        { ignores: ignorePatterns },
    ];

    return { ...eslintOptions, overrideConfig };
}
