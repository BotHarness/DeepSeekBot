# Reduce Motion: Return to latest

Physical POCO Android16, uninstrumented arm64 Release, Chinese/dark/font1.3, 1220x2712 original captures. Four original captured frames are placed left-to-right, scaled uniformly. Synthetic AX3257 Reply content only.

Before sourcea085e84ea225, APKDE2901A53D5E1BD33C3358A9A28EAADEAAD1EC79332A31F51A1A869163A7C05C. Video reduce-before-20261031T234310089Z.mp4, framePTS3.618678/3.751144/3.832722/3.965222. With transition_animation_scale=0 and a fresh app process, Jump still traverses history over~240ms.

After runtime86aed6bd019ed46ac400c6c1525512577f5d6c0d, APK7400A60518FABCBB1F3BA3FD8031D24FE52A358B1B9948D424E9FB18B73BB4E4. Video reduce-after-20261031T234818203Z.mp4, framePTS3.405256/3.513022/3.613022/3.713022. Same system setting and action now reach the end without captured intermediate scrolling. Starting held offsets differ10physical pixels due to gesture settlement; this is not a speed benchmark. Both final message006 bounds are[84,2264][998,2406].

System setting was verified0 before each app restart and restored to exact prior1 in finally after each run. Canonical message fixture was unchanged. Tracking uses original PTS and a2-pixel vertical strip atx50; full-resolution videos and XML remain local. Frame captures do not establish native presentation FPS. Near-bottom gesture settling has automated coverage; native settling, normal-mode candidate repeat, iOS and Human QA remain separate gates.
