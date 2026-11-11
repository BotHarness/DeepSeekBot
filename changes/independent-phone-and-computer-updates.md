---
section: Fixed
---

## en

- A phone with the new app no longer disconnects from a computer running Tobs 1.6.x every 20 seconds. Features that computer does not have now say to update Tobs on the computer instead of "The Host answered 404" ([ADR-0325](docs/adr/0325-phone-and-computer-tolerate-each-others-older-release.md)).

- The phone and the computer now tell each other their Tobs versions, so a future release can ask the Human to update the computer or the app instead of failing ([ADR-0325](docs/adr/0325-phone-and-computer-tolerate-each-others-older-release.md)).

## zh

- 新版手机连接运行 Tobs 1.6.x 的电脑时，不会再每 20 秒断开一次。用到这台电脑还没有的功能时，会提示更新电脑上的 Tobs，而不是显示「The Host answered 404」（[ADR-0325](docs/adr/0325-phone-and-computer-tolerate-each-others-older-release.md)）。

- 手机和电脑现在会互相告知 Tobs 版本，之后的版本可以提示更新电脑或 App，而不是直接失败（[ADR-0325](docs/adr/0325-phone-and-computer-tolerate-each-others-older-release.md)）。
