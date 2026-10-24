# Tobs / 托布

Tobs means **Team of bots**, with the spirit of **Thousands of Bots**. It is the new application name for DeepSeekBot; BotHarness remains the framework and Tob remains the built-in Bot.

Install Tobs with `npm install -g tobs`, then use `tobs --help`. Tobs is the primary product and command. The legacy `deepseekbot` command remains available for existing installations and scripts.

Both commands share the exact same implementation and preserve existing `DEEPSEEKBOT_*` environment variables, Host permissions, confirmation flags, configuration and data.

Both packages can be installed globally together: `tobs` owns only the `tobs` executable; `deepseekbot` owns the legacy executables. Uninstalling either top-level package leaves the other's command available. Update both explicitly when both commands should use the same release. With different installed versions, each command runs its own pinned version against the same selected Host.

The Tobs DSH Bundle uses the same component versions, Patch and Loader identities as DeepSeekBot. Existing Profiles can keep their `deepseekbot` Bundle entry. Do not create a second Profile or copy user data for the rename.

`dsh plugin add` enables newly installed Bundles. If you add Tobs to an existing Profile, keep exactly one product entry in that Profile's `dsh.profile.bundles`: retain `deepseekbot` to keep the old Bundle active, or replace it with `tobs` to switch. Preserve the Profile and its data; do not enable both product Bundles together.

Website: https://tobs.app/en/
