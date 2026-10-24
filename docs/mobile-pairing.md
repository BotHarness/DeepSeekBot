# Pair your phone over Tailscale

The DeepSeekBot phone app connects to DeepSeek Harness (DSH) on your own computer. Bots, chat history and approvals stay on the computer; the phone is a remote client.

Without an account, the phone **reaches the computer through Tailscale**: the phone and the computer sign in to the same Tailscale network (tailnet), the computer publishes DSH as `https://<computer>.<tailnet>.ts.net` with `tailscale serve`, and after you scan the code the phone connects back through that address. You need no public IP and no router changes, and it works over mobile data. If you would rather not set up Tailscale, use [DeepSeekBot Connect](#without-tailscale-deepseekbot-connect) instead.

The whole setup takes about 10 minutes:

1. Install Tailscale on the phone and the computer, and sign in with the same account.
2. Start DSH with the DeepSeekBot plugin on the computer.
3. Run the `tailscale serve` command shown in settings on the computer.
4. Show a pairing QR code on the computer and scan it with the phone app.

## 1. Install and sign in to Tailscale

Tailscale is free for personal use. Install it on **both the phone and the computer**:

| Device  | Download                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPhone  | [App Store: Tailscale](https://apps.apple.com/app/tailscale/id1470499037)                                                                                        |
| Android | [Google Play: Tailscale](https://play.google.com/store/apps/details?id=com.tailscale.ipn)                                                                        |
| Desktop | [tailscale.com/download](https://tailscale.com/download) (macOS, Windows, Linux). On macOS the standalone download is easiest: it ships the `tailscale` command. |

Sign in on both devices with **the same account** (Google, Microsoft, GitHub, Apple and others work) and keep the switch connected. The first time you open it on the phone, the system asks to add a VPN configuration; allow it.

Then open the [DNS page of the Tailscale admin console](https://login.tailscale.com/admin/dns) and check that **MagicDNS** and **HTTPS Certificates** are both on. The phone only accepts an HTTPS `*.ts.net` address, so it cannot connect without HTTPS certificates.

## 2. Start DSH and DeepSeekBot on the computer

Start the DeepSeek Harness desktop app (or `dsh web`) and check that the DeepSeekBot plugin is installed and enabled: **Bot mode** shows in the left bar. If it is not installed yet, follow [Install DeepSeekBot](/docs/installation) first.

Open **Bot mode**, click the gear at the bottom left to open **Bot settings**, and choose **Devices**.

![The Devices page in Bot settings with Tailscale ready](/guides/mobile-pairing/01-devices-en.webp)

If the page only shows the **Pair a phone** button, as above, Tailscale is ready: skip to step 4.

## 3. Publish DSH on your tailnet

When Tailscale is missing or not publishing DSH yet, the **Devices** page shows a yellow notice with a command, for example:

![The notice and tailscale serve command when Tailscale is not found](/guides/mobile-pairing/03-tailscale-missing-en.webp)

Open a terminal on the computer and **run the command exactly as shown** (your port may differ):

```bash
tailscale serve --bg 3080
```

- `--bg` keeps it running in the background, including after you close the terminal or restart the computer.
- On macOS, if the `tailscale` command is not found, use the full path: `/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg 3080`.
- If the first run prints a link saying HTTPS is not enabled for your tailnet, open it, enable HTTPS, and run the command again.

The command publishes DSH only to devices in your own tailnet; it is not reachable from the internet. Close and reopen the **Devices** page: once the yellow notice is gone, continue.

## 4. Show the pairing code and pair the phone

On the computer, click **Pair a phone** on the **Devices** page. A QR code opens:

![The pairing dialog with the QR code and Copy pairing link](/guides/mobile-pairing/02-pair-qr-en.webp)

The code **works once and expires after 10 minutes**. If it expires, click **New code**.

On the phone:

1. Check that the Tailscale app is connected.
2. Open the DeepSeekBot app. On first launch it opens **Pair with your computer**. If you already paired another computer, open **Workspaces** → **Computers** → **Pair a new computer**.
3. Allow the camera and point it at the code on the computer. If scanning does not work, click **Copy pairing link** on the computer, send the link to your phone (for example through your own notes or chat), and paste it into **Or paste the pairing link**.
4. Optionally give the phone a name under **Name on this phone**, then tap **Pair**.

![The Pair with your computer screen on the phone, with the camera area and the paste field](/guides/mobile-pairing/04-phone-pair-en.webp)

![A pasted pairing link, ready to pair](/guides/mobile-pairing/05-phone-pasted-en.webp)

Once paired, the phone shows the Bots and groups on your computer, and the computer's **Devices** page lists the phone under **Paired devices** with its last-seen time. Restarting the computer or DSH does not require pairing again.

![The phone after pairing, showing the computer's Bot under All and My Mac](/guides/mobile-pairing/06-phone-paired-en.webp)

## Control your computer over Tailscale

You can open a Bot's **Computer** from another network when the phone is paired through the Host's Tailscale HTTPS address. The phone and computer do not need to share a Wi-Fi network. This uses the existing native desktop viewer; it does not enable desktop video through Connect.

### Before you start

- Keep Tailscale connected on both devices in the same tailnet. Its access rules must allow communication between them. Keep the Host running and the computer awake with an accessible desktop session.
- Complete the HTTPS pairing above. In the phone's connection settings, check that the selected Host is connected through its `https://<computer>.<tailnet>.ts.net` address (possibly with a configured port), not a Connect or LAN route. If Tailscale Serve already publishes another service, preserve that mapping and use the Host's configured endpoint instead of overwriting it.
- Use a Host and native phone app that include Local Computer video. The verified macOS/iOS test build is identified below; this guide does not claim that every older stable or store build includes it.
- Enable Computer Access for the Bot and start **Local Computer** on the Host using **Check permissions**, or `deepseekbot computer-start --target local`. On macOS, allow Screen Recording for the capture helper and Computer driver, and Accessibility for input. Restart Local Computer after granting capture permission.

### Watch, control and hand back

1. On the phone, select the paired Host, open the Bot and choose **Computer**.
2. Wait for live video. Watching does not pause Bots. If video does not appear, check the connection, awake desktop and capture permissions; use **Reconnect video** after resolving the problem.
3. Tap **Take control**, then move the pointer with the touchpad. Use only the controls offered by your app version. Takeover pauses Bot access to this Computer across the Profile.
4. Tap **Hand back** when finished. Confirm the screen returns to the Bot-operable state; merely leaving the page is not equivalent to resuming Bots. Hand back releases control and resumes Bots while allowing you to keep watching.

If the network drops or the phone locks, input must stop. Reconnect returns to watching; explicitly take control again. Never repeat a click or text entry automatically after an uncertain result—inspect the desktop first.

### What has been verified

On 2026-10-25, macOS → iPhone XS Max was verified with the phone on another phone's mobile-data hotspot and **USB disconnected**: moving video, takeover, pointer movement and handback passed. Host and iOS Release app source: `8418bad80a499213427606b23dcbc8e9ff2974ad`. This is exact-build evidence, not a minimum supported version or a new store release. Windows → Android supports the native viewer in source; its **Tailscale cross-network test is pending**. Forced network-loss recovery, the full input matrix and long-duration performance also remain pending. See [qualification record](https://github.com/BotHarness/DeepSeekBot/issues/2562#issuecomment-6388900922).

For your own cross-network check, keep the computer on its original network and put the phone on mobile data or a hotspot backed by another phone's mobile data. Disconnect USB and avoid ADB reverse or other local forwarding; otherwise the picture may bypass Tailscale. A connected HTTPS endpoint proves signaling, not the video route.

The project does not provide a public TURN relay for this path. Tailscale may connect devices directly or use its own relay; WebRTC reporting `direct` does not prove the Tailscale underlay is peer-to-peer. Your network and Tailscale plan still apply. **Connect desktop video is currently unavailable**; this does not disable ordinary Connect chat or pairing, and does not prevent using a separate Tailscale connection.

## Without Tailscale: DeepSeekBot Connect

DeepSeekBot Connect lets the phone reach the computer through an encrypted tunnel at `https://<id>.deepseekbot.dev` instead of Tailscale. You sign in to the same DeepSeekBot account on both devices, with Google, Apple or a code sent to your email. The tunnel exposes only the phone interface of DSH; your Bots and conversations stay on the computer.

1. On the computer, open **Devices** → **DeepSeekBot Connect**, click **Sign in**, and confirm in the browser that the page shows the same code. The section then shows the Connect address as **Connected**. One account can link up to five computers.
2. On the phone, open the pairing screen (**Pair with your computer**). Under **Or use your DeepSeekBot account**, tap **Sign in** and sign in to the same account.
3. The phone lists the computers linked to the account. Tap **Pair with &lt;name&gt;**. No QR code is needed.

Phones paired over Tailscale keep working; a pairing QR code shown while Connect is on carries both addresses. To stop using Connect on a computer, click **Sign out** there: its tunnel and address are deleted. To delete the account itself, tap **Delete account** on the phone's pairing screen; every linked computer is signed out. The same steps are available from the CLI: `deepseekbot connect-sign-in --wait`, `connect-status` and `connect-sign-out` ([CLI guide](bot-cli.md#deepseekbot-connect-adr-0241)).

## Troubleshooting

**Settings say the code only carries the local address**
Tailscale is not publishing DSH yet. Go back to step 3, run the `tailscale serve` command, then click **New code**.

**The phone cannot reach the computer**
Check in order: Tailscale is connected on the phone; both devices use the same account; the computer is on and not asleep; DSH is running on the computer. Opening `https://<computer>.<tailnet>.ts.net` in the phone's browser tells you whether the network path works: any page the computer serves, even a DSH error page, means the phone can reach it. A browser message that the site cannot be found, the connection failed or the certificate is invalid means it cannot.

**The yellow notice is back after restarting DSH**
If the port in the notice changed, run the new `tailscale serve` command it shows.

**A phone is lost or no longer used**
Click **Revoke** next to it under **Paired devices** on the computer; the phone is cut off at once. **Unpair** on the phone only deletes the credential the phone keeps.

**Will it work on a company or school network?**
Tailscale connects directly or through its own relays on most networks. If the network blocks Tailscale, use [DeepSeekBot Connect](#without-tailscale-deepseekbot-connect), which needs only ordinary HTTPS.

## Security

- A paired phone has the same authority as you on the computer, so pair only your own devices.
- The phone keeps its credential only in the system keychain (iOS Keychain / Android Keystore); the computer keeps only its hash.
- DSH itself still listens on the local address only. Phone requests go through the DeepSeekBot device gateway and can be revoked at any time. Details: [ADR-0199](adr/0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md).
