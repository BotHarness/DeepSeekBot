# Windows 11 console lock observation

Use this run to check whether an ordinary process in the physical console session can observe the same Windows session lock and unlock. The report records the Windows version, the account category you select, WTS lock state, and two optional read-only policy values. Secure-desktop capture, LogonUI field access, software SAS, and installer prompts remain unmeasured. [Research issue #5141](https://github.com/BotHarness/DeepSeekBot/issues/5141) · [Parent security boundary #5134](https://github.com/BotHarness/DeepSeekBot/issues/5134) · [Desk research #5172](https://github.com/BotHarness/DeepSeekBot/pull/5172)

## Run on the VM console

1. Use a disposable Windows 11 VM with a known sign-in method and open its console directly through the hypervisor. Disconnect any Remote Desktop or Hyper-V Enhanced Session connection. Open a regular terminal in the repo root and confirm the account category in **Settings → Accounts → Your info**. Use `local`, `microsoft`, or `unknown` in the next step. Use an existing Node 22+ and Rust toolchain with the linker for its Windows target.
2. Build and start the foreground observer. Replace `local` with the category you saw in Settings. Omit `--read-policy` to observe only lock state, or use just `--read-policy` to skip lock observation.

   ```sh
   cargo build --locked --release --manifest-path scripts/windows-lock-probe-native/Cargo.toml --target-dir output/windows-lock-probe/build
   node scripts/windows-lock-probe.mjs run --observe-lock --read-policy --account-type local
   ```

3. For a lock observation, wait until the terminal says **Ready**. If your hypervisor forwards Windows shortcuts to the guest, send **Win+L** through the VM console. Otherwise, use the guest's **Start → account icon → Lock**. Verify that the guest locked, wait five seconds for the observer to sample the locked state, then sign back in manually with the same account. The observer has a two-minute window. Keep the same console connection open throughout.
4. Read the redacted JSON. A report with `lockObservation.status` equal to `observed` records an unlocked baseline, a locked sample, and a later unlocked sample with the same session and account markers. A timeout or session change leaves the result inconclusive. The policy values are the DWORDs found in the registry at the start of the run. `missing` and `unavailable` are separate outcomes. [WTS session state](https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/ns-wtsapi32-wtsinfoex_level1_w) · [Software SAS policy](https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-admx-winlogon#softwaresasgeneration) · [Interactive logon policy](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/security-policy-settings/interactive-logon-do-not-require-ctrl-alt-del)

   ```sh
   node scripts/windows-lock-probe.mjs collect
   ```

5. Remove the local report when finished. To remove the compiled observer and its build artifacts, also run the Cargo cleanup command. Both commands target files under the repo's ignored `output/windows-lock-probe/` directory.

   ```sh
   node scripts/windows-lock-probe.mjs clean
   cargo clean --manifest-path scripts/windows-lock-probe-native/Cargo.toml --target-dir output/windows-lock-probe/build
   ```

On a primary PC, **Win+L** interrupts the actual desktop session, including any remote desktop workflow that relies on it. Save open work and check that you can sign back in locally before taking that step. The observer runs under the signed-in account and installs no service or scheduled task. Use the same cleanup commands.

The probe is a standalone research command outside BotHarness startup, Host and Bot tooling. It adds no product runtime work. When explicitly started, it reads only two fixed registry values and samples WTS every 250 ms for at most two minutes. The report excludes account names, session identifiers, images, and input data. A successful measurement confirms the observer for this configuration and manual sign-in.
