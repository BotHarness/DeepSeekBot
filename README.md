# #5053 Android confirmation of #5074 and #5081 (no code change)

- **Device:** Android Emulator, Pixel 7 profile, Android 16. Debug dev client, JS from `origin/main` 143f38209, which includes #5074 and #5081.
- **Modes:** default (font_scale 1.0), font 2.0, max (font_scale 2.0 plus display size Large).
- **Data:** synthetic Bots; the Environment is renamed "QA Studio".

| Image | Shows |
| --- | --- |
| [activity-5074.png](activity-5074.png) | #5074 Activity rows on Android. At large text the name wraps to two lines and the time sits on its own line; default is unchanged. At max the last row scrolls clear of the navigation bar, and tapping it opened the conversation. |
| [profile-5081.png](profile-5081.png) | #5081 profile header option A on Android. At max, scrolling a tab moves the identity (banner, name, status) away and the tab strip sticks under Back. The name chip becomes a rounded rectangle. At default the identity stays fixed. |
