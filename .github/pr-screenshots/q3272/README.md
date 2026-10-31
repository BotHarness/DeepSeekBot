# Android recovery evidence

Physical POCO Android16, 1220x2712 screenshots, Chinese, dark, font scale1.3. Both captures show the same fixed QA Channel and message120 after the dedicated Host restarts. No touch input between disconnect and recovery. Test content is synthetic; no credentials or private conversation content is included.

- b.png: production Release b4cac0aeee3748b76ea7c456e398efb1a15ce508, APK455F627513F496E128A48E6075B910132E3113096B601B5CB9D93647879D69B6. Message120 moved from[222,205][1136,2406] to[222,497][1136,2698], ending behind the composer.
- a.png: production Release b551356e0ef4fcbbd134654236d8f05392d88f19, APK84C47F81A8B8AB3E5E10479000C45DAA21537C0F8F0EC11C2EB9B27487C79334. Message120 bounds[222,205][1136,2406] unchanged before/after recovery. No diagnostic logging.

Both images are original native captures. Header matches the frozen remote-main lineage; the test changes no header styling. First snapshot comparison failed, the fixed run passed. This pair proves only the tested bottom-follow recovery; it does not qualify transient frame stability, held reading, keyboard-open recovery, iOS, full connection matrix, loading performance, or Human acceptance. Reproduce using an isolated paired QA Host and a fixed long conversation, interrupt/restore only that Host with its original Home, and compare stable message bounds after automatic recovery.
