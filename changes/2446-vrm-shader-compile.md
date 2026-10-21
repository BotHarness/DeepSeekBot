---
section: Changed
---

## en

- Opening the VRM Companion panel no longer freezes the app while the character's shaders compile: they now compile in parallel before the first frame, behind the loading status ([#2446](https://github.com/BotHarness/DeepSeekBot/pull/2446)).
- The VRM Companion panel draws at 30 fps while the character rests with nothing to animate, instead of 60, halving the CPU and GPU it uses when idle. After a slow stretch lowers the resolution, the panel now restores it once frames are cheap again instead of staying blurry until it is reopened ([#2446](https://github.com/BotHarness/DeepSeekBot/pull/2446)).

## zh

- 打开 VRM Companion 面板时，不再因为编译角色着色器而让应用卡住：着色器会在第一帧之前并行编译，编译期间显示加载状态（[#2446](https://github.com/BotHarness/DeepSeekBot/pull/2446)）。
- 角色静止、没有动作要播放时，VRM Companion 面板以 30fps 绘制，不再保持 60fps，空闲时占用的 CPU 和 GPU 减半。卡顿时降低的分辨率，在每帧耗时恢复正常后会自动调回，不再一直模糊到重新打开面板（[#2446](https://github.com/BotHarness/DeepSeekBot/pull/2446)）。
