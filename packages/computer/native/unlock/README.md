# macOS Computer unlock

Run the installer from a BotHarness checkout as the logged-in Mac user. Use a
stable Apple Development or Developer ID Application certificate and its private
key in the login Keychain. Use the matching certificate on later builds.

```bash
security find-identity -v -p codesigning
node scripts/install-computer-unlock-macos.mjs install <certificate-SHA-1>
```

In **System Settings → Privacy & Security → Accessibility**, add and enable
`~/Library/Application Support/BotHarness/ComputerUnlock/ComputerUnlockAgent`.
Start a task-owned Host with `BOTHARNESS_COMPUTER_UNLOCK=1`, start the local
Computer and use `deepseekbot computer-unlock-status` to check readiness.
The LaunchAgent and its socket belong to the console user. Keep the local IPC
token in its private directory. Stop the agent with
`node scripts/install-computer-unlock-macos.mjs stop` and start the Host without
the opt-in to remove the capability. Keep the identity so an existing iPhone pin
can still recognize the Mac later.

## Physical device checks

Pair an iPhone with the owner Host over Noise LAN. Use a native iPhone build
from the same commit and a Mac logged in to the account under test.

1. On the unlocked Mac, keep Computer running. On the iPhone open Computer →
   More → Security → Automatic Unlock. Enter the Mac login password in the
   native sheet and approve Face ID. Close Computer, lock the Mac with
   Control–Command–Q, reopen Computer on the phone and complete Face ID.
   Check that the desktop appears while Bots stay paused.
2. Turn off Automatic Unlock, close Computer and lock the Mac again. Open
   Computer, choose Unlock Mac, enter the correct password and confirm.
   Check the desktop and confirm that Automatic Unlock is still off.
3. Enable Automatic Unlock again, close Computer and lock the Mac. Reopen
   Computer and cancel Face ID. Confirm the Mac stays locked and a network
   reconnect does not prompt again. Choose Unlock Mac for manual entry.
4. With the Mac locked, choose Unlock Mac and enter an incorrect password.
   Confirm the password error and that the Mac stays locked. With the correct
   password, confirm that the Human must still explicitly resume Bots.

Stop screen recording before opening the password sheet. Start the recording
after the sheet dismisses, or capture only the lock and outcome on the Mac.
Record the tested app revision, Mac build and outcomes with the reviewed evidence.
