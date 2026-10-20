# Machine-local secrets for device QA

Native device checks and store builds need a few files that must never enter git: the Firebase
config for push and the FCM key (and, once added, the Play service account key). Each machine
keeps them in one gitignored folder, `.secrets/` at the root of its main checkout. Every git
worktree of that checkout reads the same folder, so branches and worktrees reuse the files
without copying them.

## What lives in `.secrets/`

| File                          | What it is                                                                              | Where it comes from                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `google-services.json`        | Firebase config for `app.deepseekbot.mobile` and `ai.botharness.deepseekbot.dev` (push) | Firebase project `deepseekbot-d3e3a` → Project settings → General → either Android app → download |
| `fcm-v1-service-account.json` | FCM V1 service account key, a backup of the one EAS holds                               | Firebase → Project settings → Service accounts → Generate new private key                         |

`.secrets/` is listed in `.gitignore` and `.easignore`, so it never reaches a commit or an EAS
upload. A fresh clone has no `.secrets/`: copy the folder from another machine over a private
channel, or download the files again from the sources above. EAS cannot export secrets.

EAS keeps its own copies for cloud builds: the `GOOGLE_SERVICES_JSON` secret file variable
(production, preview and development environments) and the FCM V1 key on both packages' Android
credentials. Cloud builds need nothing from `.secrets/`.

## How the app finds it

`apps/mobile/app.config.js` sets `android.googleServicesFile` from, in order:

1. `GOOGLE_SERVICES_JSON`, set by EAS on its builders (or by hand to try another file);
2. `.secrets/google-services.json` in the main checkout, found through `git rev-parse
--git-common-dir`, so a worktree resolves to the same file.

With neither, the app builds without push.

## Local Android build with push

From the main checkout or any of its worktrees:

```sh
pnpm install
cd apps/mobile
npx expo prebuild --clean --platform android
npx expo run:android --device
```

On Windows PowerShell the commands are the same, with `cd apps\mobile`.

`prebuild --clean` is needed once per checkout, and again after `app.config.js`, `app.json`, a
native dependency or `.secrets/google-services.json` changes; an `android/` folder generated
earlier does not pick up the Firebase config. Reserve the phone or emulator through
[shared device QA](device-qa.md) first.

## Store builds from a clean clone

Run EAS from `apps/mobile` with `EAS_NO_VCS=1 EAS_PROJECT_ROOT=../..`. Without it EAS uploads the
repository's `.git` history (over 1 GB of PR media) and the archive can pass the 2 GB limit.
`.easignore` at the repo root keeps the rest of the upload to the app. Profiles: `store-test`
(AAB for Play) and `store-test-apk` (sideloadable APK, signed with the upload key, so a phone
must uninstall the Play copy before installing it).

```sh
cd apps/mobile
EAS_NO_VCS=1 EAS_PROJECT_ROOT=../.. npx eas-cli build --platform android --profile store-test
EAS_NO_VCS=1 EAS_PROJECT_ROOT=../.. npx eas-cli build --platform android --profile store-test-apk
```

In PowerShell, set the variables first: `$env:EAS_NO_VCS='1'; $env:EAS_PROJECT_ROOT='../..'`.

## Rules

- Never commit these files, paste their contents into chat, a PR, an issue or a log, or copy
  them into a worktree. Pass paths, not values.
- `prebuild` copies the Firebase config into `apps/mobile/android/app/google-services.json`.
  `apps/mobile/.gitignore` ignores `android/`, so it stays out of git; delete `android/` before
  sharing or archiving a checkout.
- A new machine-local secret goes into `.secrets/` and gets a row in the table above in the same
  change that starts using it.
