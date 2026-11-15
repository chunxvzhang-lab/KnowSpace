# English Windows build

The desktop renderer defaults to English. Fixed UI strings are translated from
`locales/en.json` at build time by `scripts/localize-english.cjs`. The same
translation pass is applied to the Electron main process when building English
installers. User notes, file contents, IPC names, storage keys, and file formats
are not translated. Translation runs locally without sending source or notes to
an external service. Packaging uses the local Electron distribution;
electron-builder may download platform tooling if it is not already cached.

```powershell
npm run desktop:pack:en
```

This runs translation coverage, TypeScript, Vite, and electron-builder. Outputs:

- `release/english/KnowSpace-Setup-2.7.9-en.exe`
- `release/english/KnowSpace-2.7.9-en.msi`
- `release/english/win-unpacked/KnowSpace.exe`

NSIS includes only `en_US` (1033). The builder's MSI template uses ProductLanguage
1033. The packaged application also sets Chromium's locale to `en-US`.
Existing packages outside `release/english` are preserved.

For the original Chinese renderer, set `KNOWSPACE_LANGUAGE=zh` before running
Vite. English packaging explicitly sets the build language to `en`.

## Verification and screenshots

```powershell
node scripts/localize-english.cjs
node scripts/verify-english-desktop.cjs
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5210
# In another terminal:
node scripts/verify-review-theme.cjs
node scripts/capture-english-screenshots.cjs
```

The packaged-app check launches the actual unpacked executable with its own
`--user-data-dir` and a disposable demo vault under `output/english-desktop-qa`.
Its eight checks cover native menus, startup, profile isolation, Markdown saving,
preservation of Chinese user content, Flash Note archiving with a populated
timeline, FSRS review with answer reveal, and readable default system-light
review. It does not install over an
existing application.

The review-theme browser regression checks the default system theme against
light and dark OS preferences and a live preference change. The system-light
rules prevent pale flashcard questions and ratings from disappearing on white.

The website screenshots render the production application with a synthetic
English vault and an isolated filesystem adapter. Every capture checks for
Chinese UI text and renderer errors. Captures are under `web/public/images/en`;
their manifest is `output/english-screenshots.json`. No UI text is painted over
an existing screenshot.

Build the website with `npm test` and `npm run build` from `web`, serve its
production output on port 5201, then run `node scripts/verify-english-web.cjs`
from the project root. This checks fresh and saved language preferences,
unavailable storage, all 35 guides and their English images, and mobile layouts.

New Chinese source literals without catalog entries stop the English build.
Add their English translations before rebuilding. The translator's regression
tests are in `src/__tests__/english-build.test.ts`.

The English packages were uploaded and verified on 2026-11-09 in the existing
[v2.7.9 GitHub Release](https://github.com/chunxvzhang-lab/KnowSpace/releases/tag/v2.7.9):

- [English EXE](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.7.9/KnowSpace-Setup-2.7.9-en.exe)
- [English MSI](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.7.9/KnowSpace-2.7.9-en.msi)
- [English SHA-256 checksums](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.7.9/SHA256SUMS-en.txt)

GitHub's asset sizes and SHA-256 digests match the local files. Verification is
recorded in `output/github-english-release-verification.json`. The English
website now selects these installers and their matching verification data;
the Chinese page keeps the original installers. Website downloads only offer
MSI and EXE installers; the portable ZIP download entry has been removed.
