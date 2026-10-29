# WorkOS social login clients (UAT and Prod)

Hosted Connect and TOB sign in through TOB's WorkOS environments (ADR-0241). In **Staging (UAT)**, WorkOS provides default Google, Microsoft, GitHub and Apple credentials for testing only. Their consent screens show WorkOS's name and logo. **Production has no default credentials**: every provider it offers needs its own OAuth client. This runbook registers our own clients for both environments, enters them in WorkOS, and stores them machine-locally.

## Who does what

- The Human signs in to every console: WorkOS, Google Cloud, Azure, GitHub and Apple Developer. An agent never types a password, OTP or passkey, and never creates an account.
- An agent with the Human's signed-in browser (for example the Codex in-app browser) does the rest:
  - creates the apps in the provider consoles;
  - copies each Redirect URI from the WorkOS Dashboard;
  - enters the credentials in WorkOS;
  - writes the files below.
- Never print, paste or log a client secret or private key. That covers chat, issues, PRs, commits and terminal output. Move values from the page straight into the file.

## Where the values are stored

Use the gitignored `.secrets/` folder at the root of the **main checkout**; see [machine-local secrets](device-secrets.md). Files are mode 600. There is one dotenv file per provider, holding both environments under `UAT`/`PROD` prefixes:

```text
.secrets/
  google-oauth.env      GOOGLE_OAUTH_{UAT,PROD}_{CLIENT_ID,CLIENT_SECRET,REDIRECT_URI}, WORKOS_{UAT,PROD}_CLIENT_ID
  apple-oauth.env       APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_FILE,
                        APPLE_{UAT,PROD}_{SERVICE_ID,REDIRECT_URI,OUTBOUND_EMAIL_DOMAIN}, WORKOS_{UAT,PROD}_CLIENT_ID
  apple-signin.p8       Sign in with Apple private key (one key serves both Services IDs)
  microsoft-oauth.env   MICROSOFT_OAUTH_{UAT,PROD}_{CLIENT_ID,CLIENT_SECRET,REDIRECT_URI,SECRET_EXPIRES_AT}  (not registered yet)
  github-oauth.env      GITHUB_OAUTH_{UAT,PROD}_{CLIENT_ID,CLIENT_SECRET,REDIRECT_URI}                   (not registered yet)
```

Load a file with `set -a; . .secrets/google-oauth.env; set +a` and never echo its values. To check a file, print only its key names (`sed -E 's/=.*/=<set>/'`).

Status on 2026-10-21: Google and Apple are registered for UAT and Prod, and Production Apple authorization was verified in the browser. Microsoft and GitHub are not registered.

Client IDs and Redirect URIs are not secret, but they sit next to the secrets so one file describes the environment. Only the WorkOS client IDs belong in committed code. Today that is UAT's `client_01M54TZZAA0Y6A248NCFYD84A5`, which the relay publishes at `https://connect.botharness.ai/v1/config`.

## Steps, per environment (do UAT first, then Prod)

0. **Identify the environment.**
   - In the WorkOS Dashboard, switch to the environment (Staging for UAT, Production for Prod). Record its client ID as `WORKOS_{UAT,PROD}_CLIENT_ID` in the provider files.
   - If Production has never been set up, stop and ask the Human. Activating it can involve billing and domain choices.
   - Don't change any other WorkOS setting (sign-up policy, sessions, redirect URIs of apps) unless this runbook says so.
1. **Google** ([docs](https://workos.com/docs/integrations/google-oauth)):
   - In WorkOS, go to Authentication → OAuth providers → Google → Manage and copy the Redirect URI.
   - In Google Cloud, use one project per environment.
     - Configure the consent screen: External, the DeepSeekBot name, logo and support email, and only the scopes `openid`, `email` and `profile`.
     - Under Clients, create a client of type **Web application**. Add the WorkOS Redirect URI under Authorized redirect URIs.
     - Copy the client ID and client secret; the secret may not be shown again.
   - On the Audience tab, **Publish app**. A client left in testing shows "Access blocked" to other users.
   - In WorkOS, choose "Your app's credentials", paste the values and save.
2. **Microsoft** ([docs](https://workos.com/docs/integrations/microsoft-oauth)):
   - In Entra ID → App registrations, create a new registration with Supported account types set to **Personal Microsoft accounts only**, as WorkOS's guide specifies.
     - Add a **Web** platform with the WorkOS Redirect URI.
     - Under Token configuration, add the optional claims `email`, `family_name` and `given_name`, accepting the Graph permission prompt.
     - Create a client secret and copy its **Value**, not its ID.
   - Record `SECRET_EXPIRES_AT`. Secrets last at most 24 months; add a reminder to rotate.
   - Enter the Application (client) ID and the secret in WorkOS.
3. **GitHub** ([docs](https://workos.com/docs/integrations/github-oauth)):
   - Under the organization that should own it, create an **OAuth App** (one per environment, because an OAuth App has one callback).
     - Set Homepage URL to `https://botharness.ai`.
     - Set Authorization callback URL to the WorkOS Redirect URI.
     - Generate a client secret; it is shown once.
   - The `user:email` scope is required. WorkOS requests it.
   - Enter the values in WorkOS.
4. **Apple** ([docs](https://workos.com/docs/integrations/apple)):
   - This needs the Human's Apple Developer team.
   - Under Identifiers, reuse or create an App ID with Sign in with Apple enabled, then register a **Services ID** and configure it:
     - enable Sign in with Apple and select that App ID;
     - add `api.workos.com` under Domains;
     - add the WorkOS Redirect URI under Return URLs.
   - Under Keys, create a key with Sign in with Apple and download the `.p8` straight into `.secrets/apple-signin.p8`. It can be downloaded only once.
   - Under Services, open Sign in with Apple for Email Communication. Add the Outbound Email Domains that the WorkOS dialog lists, until each shows a green check.
   - In WorkOS, enter the Team ID, Services ID, Key ID and key file.
5. **Write and check the files.**
   - Write each provider's `.env` with `chmod 600`.
   - Check that every expected key is set without printing values, for example `sed -E 's/=.*/=<set>/' .secrets/google-oauth.env`.
   - Confirm `git check-ignore -v .secrets/google-oauth.env` shows it is ignored.

## Custom domains: not used

WorkOS custom domains, which put the sign-in page and OAuth callbacks on our own domain, exist only in Production and are a paid add-on ($99 per month on [WorkOS pricing](https://workos.com/pricing), checked 2026-10-21). The Human decided not to pay for them. Both environments keep WorkOS's domains: the generated AuthKit domain and `api.workos.com` callbacks. The provider consent screens still show our app name and logo, from our own clients. Revisit before a public launch. If it is ever enabled, use `deepseekbot.app` (never `deepseekbot.dev`, which ADR-0241 reserves for Host tunnels). Check whether the token `iss` changes, because the relay, Host, phone and TOB hard-code `https://api.workos.com/user_management/...`.

## Verify

- **Each provider in each environment:**
  - Run `deepseekbot connect-sign-in --wait` on an isolated Host and choose the provider on the AuthKit page. The Human completes the login.
  - Confirm `connect-status` shows `signed-in` with that account's email, then `connect-sign-out`.
  - Check that the consent screen shows DeepSeekBot, not WorkOS.
- **The phone (UAT):** sign in from the Pair screen's account section on the dev app through the shared device QA queue ([device-qa.md](device-qa.md)).
- Report pass or fail per provider and environment, with no identifiers beyond the provider name.

## Open questions for the Human

- **Prod:** confirm which WorkOS environment Prod is. The relay and the phone use UAT's client today, so switching them to Prod is a separate change.
- **Store app redirect:** the store app (`app.deepseekbot.mobile`) needs its own redirect URI, because the phone's code currently uses `ai.botharness.deepseekbot.dev:/oauth2redirect`. Decide this before Prod sign-in on store builds.
