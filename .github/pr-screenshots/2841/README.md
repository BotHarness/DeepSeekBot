# Android Profile evidence

Physical POCO Android 16, Chinese, unchanged default font scale; status bar cropped by the QA owner. Synthetic QA content only.

- b.png: original refusal on main a344c131ee77, dark theme.
- d.png / l.png: dark/light Group Profile on frozen source 20c6ec23b357. Dark is the comparable before/after pair; no light baseline was captured.
- Native APK SHA256: 4ad4f10897834f51cc72780b446c6936065df1698fe411274eb1a5adaf8cda1f, built at a344c131; unchanged cumulative native inputs, fresh Metro at the tested source.

Focused physical-device results: All -> B DM/Profile Message -> All -> A group Profile; A member Message -> correct A DM -> system Back to group Profile; Host mute and chat background affect only A despite identical group IDs on A/B. SectionHeader key warning absent on the observed path. Test settings restored and resources released.

Not tested: source removal/pending-source cancellation, iOS, expanded font/accessibility matrix, OS notification delivery, model interruption. Cloud explicitly excluded. This is focused regression evidence, not complete native acceptance.
