# #2488 row status after a finished turn (phone, main a0701f38)

Device: Xiaomi FE5XNBAEFQTS7DMZ, HyperOS 3 / Android 16, zh-CN. Isolated QA Host on main a0701f38; live model deepseek-v4.1-flash. Status bar and the computer name are blanked. Store package built from main a0701f38.

Nova ran five turns in a row (each asked for `sleep 6 && echo CHKn` in bash). After each turn ended, the Chats list was captured with the app in the foreground.

- `checks-5-runs.png`: the status icon of the Nova row after runs 1-5, zoomed 3x. All five check marks are upright.
- `run1-later.png` ... `run5-done.png`: the full Chats screen for each run.

A capture 3 s after run 1 still showed the closing progress ring. Captures 8 s or more after the reply always showed the upright check. In runs 2-5 the bot said bash was blocked by the sandbox and produced the output another way; each turn still finished normally.
