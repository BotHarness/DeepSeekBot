# iOS recording baseline — Batch55

Native Simulator capture, iOS27, 402 × 874 points, light appearance, large text, keyboard hidden. Source 87724a3b58d556807ef1ba860adcbb96bda6d92f includes merged #2592. Debug app strict native fingerprint b3e74315f0c2d639dd1c1ff73e56182e0fb86c0e; installed signed executable SHA256 55de08577ac5ddb38fb0221427750b8d5096dfe10b55a1561bb438c3bf95807a.

Actual short tap and 800ms hold left the button idle. The callback observer remained installed/current: onHeld/finalize only, zero onStart/onStop/onCancel. The speech observer saw no availability, permission or native events. Both observers were stopped and restored. Loaded Hermes code included the #2592 onBegin/activate change. This is a native FAIL, not evidence that speech started and immediately stopped.

The screenshot shows the clipped/offset microphone symbol. It contains only the synthetic QA Bot label and no private message, credential or transcription. Original capture retained locally; published PNG is unmodified. No after or listening state is claimed: #2594 awaits a new owner-cut native test batch, with matching theme/size/viewport/keyboard baseline and real start/stop/error screenshots. Android, physical microphone, VoiceOver and historical immediate-end remain unverified.
