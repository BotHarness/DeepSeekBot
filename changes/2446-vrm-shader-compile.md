---
section: Changed
---

## en

- Opening the VRM Companion panel no longer freezes the app while the character's shaders compile: they now compile in parallel before the first frame, behind the loading status ([#2446](https://github.com/BotHarness/DeepSeekBot/pull/2446)).
- The VRM Companion panel draws at 30 fps while the character rests with nothing to animate, instead of 60, halving the CPU and GPU it uses when idle. After a slow stretch lowers the resolution, the panel now restores it once frames are cheap again instead of staying blurry until it is reopened ([#2446](https://github.com/BotHarness/DeepSeekBot/pull/2446)).
- On a computer without graphics acceleration (software WebGL such as SwiftShader, llvmpipe or Microsoft Basic Render), the VRM Companion panel no longer starts the 3D character, which ran at about 1 fps and froze the app. It explains why and offers **Show 3D anyway** ([#2446](https://github.com/BotHarness/DeepSeekBot/pull/2446)).
- The VRM Companion panel speaks more like a companion: while the character loads it shows "<Bot> is signing in" over a blurred still of the last scene, then fades the character in, and its header and error messages use plain words (Relaxing, Waiting for you, Taking a break, Offline) instead of raw states ([#2446](https://github.com/BotHarness/DeepSeekBot/pull/2446)).

## zh

- 打开 VRM Companion 面板时，不再因为编译角色着色器而让应用卡住：着色器会在第一帧之前并行编译，编译期间显示加载状态（[#2446](https://github.com/BotHarness/DeepSeekBot/pull/2446)）。
- 角色静止、没有动作要播放时，VRM Companion 面板以 30fps 绘制，不再保持 60fps，空闲时占用的 CPU 和 GPU 减半。卡顿时降低的分辨率，在每帧耗时恢复正常后会自动调回，不再一直模糊到重新打开面板（[#2446](https://github.com/BotHarness/DeepSeekBot/pull/2446)）。
- 在没有显卡加速的电脑上（SwiftShader、llvmpipe、Microsoft Basic Render 等软件渲染），VRM Companion 面板不再启动 3D 角色：以前大约只有 1fps，还会让应用卡死。现在面板会说明原因，并提供 **Show 3D anyway**（[#2446](https://github.com/BotHarness/DeepSeekBot/pull/2446)）。
- VRM Companion 面板的文案更像一个陪伴者：加载时在模糊的上一帧画面上显示「<Bot> is signing in」，然后角色淡入；标题栏和错误提示改用日常用语（Relaxing、Waiting for you、Taking a break、Offline），不再直接显示内部状态值（[#2446](https://github.com/BotHarness/DeepSeekBot/pull/2446)）。
