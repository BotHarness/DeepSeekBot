# Store privacy answers

The answers for Google Play **Data safety** and App Store **App Privacy**, kept next to the app so they change with it. Privacy policy: <https://deepseekbot.app/en/privacy/#mobile-app> (zh: <https://deepseekbot.app/privacy/>). Issue: #2303.

These answers describe the `store-test` build: `EXPO_PUBLIC_DEEPSEEKBOT_CLOUD=off` and no `EXPO_PUBLIC_MOBILE_TELEMETRY*`, so it has no accounts and sends no statistics. Re-check them when either changes.

## Facts

| Data                                                | Where it goes                                                                 | Source                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| Pairing credential                                  | Phone only: SecureStore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`                     | `src/host/saved-host.ts`                      |
| Conversation cache, drafts                          | Phone only: app cache directory                                               | `src/host/native-cache.ts`                    |
| Messages, photos, files, dictated text              | Only the Human's own Computer, over Tailscale HTTPS                           | `src/host/route.ts`                           |
| Expo push token                                     | Phone → own Computer → `exp.host`; Expo keeps it to deliver notifications     | `src/host/push.ts`, `packages/core/src/push/` |
| Notification text (Bot/channel name, short preview) | Sent by the Computer through Expo to APNs/FCM, not by the app                 | `packages/core/src/push/delivery.ts`          |
| Voice                                               | System speech recognizer (Apple/Google); the app records and uploads no audio | `src/host/speech.ts`                          |
| Statistics                                          | Not sent by `store-test`                                                      | `src/telemetry/native.ts`                     |
| Accounts, ad ID, ads or crash SDKs                  | None                                                                          | `src/cloud/available.ts`, `package.json`      |

## Google Play: Data safety

| Question                                                              | Answer                                                                                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does your app collect or share any of the required user data types?   | Yes                                                                                                                                                           |
| Data types                                                            | **Device or other IDs** only (the push token passes through our Expo project)                                                                                 |
| Collected / shared                                                    | Collected; not shared (Expo is a service provider)                                                                                                            |
| Processed ephemerally?                                                | No (Expo keeps the token so it can deliver later notifications)                                                                                               |
| Required or optional?                                                 | Optional (the Human can refuse notifications)                                                                                                                 |
| Purpose                                                               | App functionality                                                                                                                                             |
| Is all data encrypted in transit?                                     | Yes                                                                                                                                                           |
| Account creation                                                      | My app does not allow users to create an account                                                                                                              |
| Do you provide a way for users to request that their data is deleted? | No. There is no account to delete; Unpair removes the token from the Human's own Computer, but the copy Expo keeps for delivery has no deletion request flow. |
| Independent security review                                           | No                                                                                                                                                            |

Every other category stays undeclared: it is used on the phone only, or the Human sends it to their own device, which we cannot access. Notification previews pass through Expo but are sent by the Computer, so Messages is not declared.

## App Store: App Privacy

**Identifiers → Device ID**, purpose **App Functionality**, **not linked** to the Human, **not used for tracking**. Expo keeps the push token so it can deliver notifications. Nothing else is collected: content goes only to the Human's own Computer, Expo does not keep notification content after delivery, and speech recognition is Apple's system service. Machine-readable: [`app-store-privacy.json`](app-store-privacy.json).

## Apply

Replace `<apple-id-email>` and `<play-service-account>` with your own values, without the angle brackets, before running either command.

**App Store, from the command line** (any Mac, with an App Store Connect admin Apple ID; fastlane logs in with the Apple ID, not an API key):

```sh
brew install fastlane
cd apps/mobile/store/privacy
fastlane run upload_app_privacy_details_to_app_store \
  app_identifier:app.deepseekbot.mobile \
  json_path:app-store-privacy.json \
  username:<apple-id-email>
```

It replaces all existing answers and publishes them. Add `skip_publish:true` to review in App Store Connect first.

**Google Play.** The Play Developer API accepts the form only as Play's own CSV (`POST applications/{packageName}/dataSafety` with `safetyLabels` set to the CSV text), and the CSV's question IDs come from a template exported in Play Console. So:

1. Fill the form once in Play Console (App content → Data safety) using the table above, in the browser.
2. Export it to CSV and commit it here as `play-data-safety.csv`.
3. For later changes, edit the CSV and upload it with the service account key that `eas submit` uses:

   ```sh
   export GOOGLE_APPLICATION_CREDENTIALS=<play-service-account>.json
   jq -Rs '{safetyLabels: .}' play-data-safety.csv |
     curl -sS -X POST \
       -H "Authorization: Bearer $(gcloud auth application-default print-access-token --scopes=https://www.googleapis.com/auth/androidpublisher)" \
       -H 'Content-Type: application/json' --data @- \
       https://androidpublisher.googleapis.com/androidpublisher/v3/applications/app.deepseekbot.mobile/dataSafety
   ```

## When phone statistics ship

A build that actually sends statistics changes both answers. That needs all of `EXPO_PUBLIC_MOBILE_TELEMETRY=production`, a public `phc_` token, a physical release build and `EXPO_PUBLIC_MOBILE_TELEMETRY_QUALIFIED=true` ([what it sends](../../../../docs/mobile-statistics.md)):

- **Play:** add App activity → App interactions; App info and performance → Other app performance data; add Analytics to Device or other IDs. All collected, not shared, not ephemeral, optional (Settings switch), purpose Analytics.
- **App Store:** use [`app-store-privacy.statistics.json`](app-store-privacy.statistics.json): Device ID (App Functionality and Analytics), Product Interaction and Other Diagnostic Data (Analytics), all not linked to the Human and not used for tracking.
