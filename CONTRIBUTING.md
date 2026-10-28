# Contributing to Realyn

Realyn is a side project. Small, focused contributions are welcome; there is no response-time or release schedule commitment.

Start with the [README](README.md) for local setup and [project status](docs/PROJECT_STATUS.md) for scope and limitations.

## Useful contributions

- Clearer setup instructions and reproducible local demos.
- Fixes for a specific dispute or evidence workflow.
- Synthetic test cases for processor mappings and AI output failures.
- Documentation that distinguishes implemented behavior from experiments.

For a larger change, open an issue describing the problem and proposed scope before spending a lot of time implementing it.

## Working on a change

1. Work on a branch and keep the change focused.
2. Use synthetic data and processor test credentials. Do not include personal records, evidence uploads, API keys, or production exports.
3. Run the relevant checks listed in the README. Functions needs its own dependency install and a built AI package.
4. Open a pull request explaining the problem, resulting behavior, checks run, and anything left unverified.

Documentation-only changes should check commands, relative links, and claims against the repository. Code changes should include a regression test when one would meaningfully demonstrate the fix.

For AI work, include representative inputs, expected behavior, and observed failures. Use the [evaluation workflow](docs/eval/README.md); a convincing example alone does not establish quality across cases.

For integration work, state whether validation used a mock, emulator, processor test environment, or live service. Keep unsupported processor and compliance claims out of descriptions.

## Licensing

The repository currently has no license file. Do not assume permission to redistribute or reuse it under an open-source license. Licensing is a maintainer decision.

