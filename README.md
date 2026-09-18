# eslint-rule-specific-fix

Apply ESLint autofixes only for explicitly selected rules. Diagnostics and source
changes from every other rule are left untouched.

Requires ESLint 9 or newer and Node.js 18.18 or newer.

## Installation

Install the package next to ESLint in your project:

```sh
npm install --save-dev eslint eslint-rule-specific-fix
```

## Usage

Pass `--rule` once for every rule whose fixes should be applied, followed by one
or more file paths or glob patterns:

```sh
npx eslint-rule-specific-fix \
  --rule @stylistic/object-curly-spacing \
  tests
```

The command uses the ESLint flat configuration from the current project. Rule
IDs must match the IDs reported by ESLint, including plugin prefixes.

The `--rule=<rule>` and short `-r <rule>` forms are also supported:

```sh
npx eslint-rule-specific-fix -r semi --rule=quotes "src/**/*.js"
```

Use `--` before a file pattern beginning with a hyphen.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No selected-rule violations remain |
| `1` | At least one selected-rule violation could not be fixed |
| `2` | Invalid arguments or an ESLint/runtime error |

Violations from rules not passed to `--rule` do not affect the exit code.

## License

MIT
