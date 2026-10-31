# Android history retry recovery

Physical POCO Android 16, Release arm64, Chinese, dark, font scale 1.3, 1220x2712. Synthetic AX3257 Anchor history only. No account names, pairing secrets or Host addresses in captures.

Before: production stack720ff70a9bee plus local eight-second pagination-delay diagnostic52808c188; APK A64B039E9ED2A7644E44A20825DAEA3511E1FAE8F4E4B647FAF1AFA1F665609D. After: local experimentc167e98dd, same delay plus geometry logging, APK5B6DFBB5CAABBD747DDC85C0D08A5428C98325CD2BE43AD846D268DD57A91077. These are controlled-fault diagnostic Release builds, not uninstrumented acceptance builds or performance measurements.

Both captures follow history-load failure and dedicated QA Host restart. Before: message71 moved786->494 physical pixels and retry was behind the header. After: message71 remained786->786, retry bounds[36,425][1184,569]; pressing it succeeded and message71 remained786. Stable endpoints do not prove all transient frames stable. Ordinary keyboard/follow, larger text, light mode, iOS and Human QA remain pending.
