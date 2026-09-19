# eslint-rule-specific-fix

Apply ESLint autofixes only for explicitly selected rules. Diagnostics and source
changes from every other rule are left untouched.

Requires ESLint 9 or newer and Node.js 18.18 or newer.

| ESLint | Node.js |
| --- | --- |
| 9 | `>=18.18.0` |
| 10+ | `^20.19.0 || ^22.13.0 || >=24` |

If ESLint 10 is installed on an older Node.js, or the project has no flat config
file (`eslint.config.js` / `.mjs` / `.cjs`), the CLI exits with code `2` and a
concrete message instead of an ESLint stack trace. `.eslintrc.*` is not read.

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

`--dry-run` computes the same selected-rule fixes without writing files.
`--json` prints a machine-readable summary to stdout:

```sh
npx eslint-rule-specific-fix --dry-run --json --rule semi src
```

```json
{
  "written": false,
  "changedFileCount": 1,
  "remainingSelectedCount": 0,
  "fatalCount": 0
}
```

## JS API

The same selected-rule fixer can be called from Node.js. It uses the ESLint
installed next to this package and writes fixes by default.

```js
import { fixRules } from 'eslint-rule-specific-fix';

const report = await fixRules(['src/**/*.js'], {
  rules: ['semi', 'quotes'],
  cwd: process.cwd(),
  write: false,
});

console.log(report.summary);
```

`report.exitCode` uses the same 0/1/2 meanings as the CLI. Pass `eslintOptions`
through to the `ESLint` constructor when you need a custom config file or cwd.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No selected-rule violations remain |
| `1` | At least one selected-rule violation could not be fixed |
| `2` | Invalid arguments or an ESLint/runtime error |

Violations from rules not passed to `--rule` do not affect the exit code.
`--dry-run` uses the same codes; it only skips writing files.

## Development

Development uses ESLint 10 and therefore requires Node.js 20.19 or newer.

```sh
npm ci
npm run lint
npm test
```

## License

MIT
