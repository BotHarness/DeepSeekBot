# Lark pairing in Activity Center and new-user onboarding

## Native qualification — 2026-11-03 JST

An isolated Host on DSH `0.2.1-rc.3` with Provider `e655636c061fa0aed8c77c23f7e87cb5abf79b65` connected the dedicated `BotHarness Lark QA1` app. A Bot with workspace-write access, a _Tester_ Role and restricted senders was prepared through the CLI. A real model handled every turn.

| Step            | Actual action                                                          | Result                                                                                                                       |
| --------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| First DM        | The test account sent its first message                                | Not run; Lark replied with reference `BAA03E42E6` and a 10-minute expiry                                                     |
| Activity Center | Web Client, light and dark                                             | **Needs you** listed “BearDoodle asks to chat with Lark Helper” as a flat row with a Role picker, **Accept** and **Decline** |
| Approve         | Picked _Tester_, chose **Accept**                                      | Pairing approved with the Role; the item left Activity Center; Lark sent the ask-again notice                                |
| Person limit    | One-person group allowing _Run commands_, denying _Share memory files_ | Saved through `sender-access`                                                                                                |
| Question        | `E2E_Q1 …`                                                             | Answered in the DM                                                                                                           |
| Execution       | Asked for `echo E2E_RUN_OK` with wider access                          | Approval appeared in Activity Center; **Allow once** in Web ran it; the DM received `E2E_RUN_OK`                             |
| Denied behavior | Asked for the raw memory files                                         | Refused, naming the Deny rule                                                                                                |

The first Web run found a defect: the item had no Channel name, and the Client rejected the whole Activity Center response as invalid. The query now uses the Bot DM name, and the Client requires a request ID for this kind.

After the rows were flattened, a fresh chat request was accepted again with _Tester_, and a `/pair` management request was accepted with only _Answer formal questions_.

Not covered natively: rejection, expiry, and the mobile app, which lists the item without inline review. Behavior limits are model instructions, not a sandbox.
