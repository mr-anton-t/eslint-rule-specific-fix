export default [
    {
        ignores: [
            'coverage/',
            'node_modules/',
        ],
    },
    {
        files: ['**/*.{js,mjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                console: 'readonly',
                process: 'readonly',
            },
        },
        linterOptions: {
            reportUnusedDisableDirectives: 'error',
        },
        rules: {
            'constructor-super': 'error',
            eqeqeq: ['error', 'always'],
            'for-direction': 'error',
            'no-async-promise-executor': 'error',
            'no-constant-condition': 'error',
            'no-debugger': 'error',
            'no-dupe-args': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',
            'no-fallthrough': 'error',
            'no-import-assign': 'error',
            'no-undef': 'error',
            'no-unreachable': 'error',
            'no-unused-vars': 'error',
            'no-useless-catch': 'error',
            'no-var': 'error',
            'prefer-const': 'error',
            'use-isnan': 'error',
            'valid-typeof': 'error',
        },
    },
];
