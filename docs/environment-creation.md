# Create in an environment

Open the Channels add menu and choose a new Bot or Channel. The form names its target environment. In All, choose a Host the first time; later forms remember the last creation Host. With one available Host, the form can preselect it. A single-Host view uses that Host.

An offline target stays selected and visible. Reconnect it, or explicitly choose another online Host from All. Creation is never queued or redirected to This Host. Changing the browsing filter while a form or request is open does not change its target.

If creation is unconfirmed, the form locks its original target and input; Retry repeats the same operation on that Host. A returned creation receipt is reused when only later setup failed. Git imports first inspect the selected repository commit. An unconfirmed Section creation offers a refresh of that Host's Section list and cannot resend creation; check the result before closing the form and explicitly starting another action. A replaced connection requires closing and reopening the form.

New Bots, Git imports and Channels use the selected Host's existing owners. A remote Bot's optional Memory path refers to that Host; the local folder picker is unavailable. ZIP and marketplace imports retain their existing local workflow: switch to This Host explicitly before using them. Their forms name the local target.

In a single remote Host view, the add menu's Section entry opens that Host's Section manager. Create a Section, rename it with Enter or blur, assign Channels, or move a Section/member up. Changes update that Host's Feed. All displays a flat list and offers no Section management.

Agents can perform and verify the same owner operations through the existing online CLI. Select the exact owning Host with `--host` and its private `--token-file`: use `create`, `group-create`, and the `roster-section-*`/`channel-assign` commands documented in [Bot CLI](bot-cli.md). Compare `list`, `channels`, and `roster` on both Hosts after a UI mutation; a visible result and its owning Host readback are separate evidence.
