---
Status: Accepted
Date: 2026-10-26
---

# Profile Backup compatibility is owned by the data contract

Profile Backup owns one compatibility interpretation across preview, export, inspection and Managed Restore. Producer release labels describe provenance; archive format, Schema Generation and Host-owned Dependency Contracts determine whether data can be read. Installation admission is not a backup-format guarantee. This implements ADR-0042 and ADR-0044 without introducing a second migration owner.

The reader retains version 1 archives, including the historical `dsh@0.2.0-rc.1` declaration. That reference identifies the producing runtime, not an exact target requirement. The required `runtime/core` declaration must be present exactly once, required, and understood; an archive cannot remove it or make it optional. Unknown required data contracts remain refusals. Target-local model/provider availability is evaluated separately through Activation Readiness.

New archives use format version 2. The producer records the Host version obtained from the launch entry's native runtime and the independently resolved DSH tools version. Either can be explicitly unknown. This replaces the v1 producer literal with honest provenance without pretending that old readers understand the new encoding. The core runtime reference names `botharness-core`; its `botharness-core/1` contract governs data interpretation. Native DSH Session content remains unsupported.

Managed Restore validates the archive in staging and delegates Schema Generation migration to the operational database owner. A newer unsupported archive format reports `format-upgrade-required`; a newer database generation reports `upgrade-required`; an unknown required contract reports `dependency-incompatible`; failed integrity reports `package-invalid`. The HTTP adapter retains the operation in the refusal. Web and CLI adapters present the same result, and Web errors stay with the action that failed.

## Considered alternatives

- Replace every rc.1 string with the installation SemVer range: rejected because admission cannot establish data readability, migration availability or target readiness.
- Keep writing a fictitious rc.1 producer: rejected because it conceals the runtime split reported in #2790 and corrupts provenance.
- Require users to export old data again: rejected because the original installation may be unavailable.
- Add a general compatibility registry or another migration pipeline: rejected because the existing Profile Backup and database owner seams already own these responsibilities.

## Consequences

- Historical v1 archives remain readable; old binaries are not promised forward compatibility with v2. Upgrade the reader before restoring a newer archive.
- Release-label differences and unknown provenance alone cannot block readable data. Actual source database unavailability still refuses export explicitly.
- Restore remains cold and identity-preserving; credentials, Workspace authority and provider execution do not become portable authorization.
- Permanent historical fixtures, real staged migrations and current cross-version roundtrips exercise the existing module interface. Synthetic release strings prove policy behavior, not runtime qualification.
- Source report: [#2790](https://github.com/BotHarness/DeepSeekBot/issues/2790). Implementation specification: [#2794](https://github.com/BotHarness/DeepSeekBot/issues/2794).
