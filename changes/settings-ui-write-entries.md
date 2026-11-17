---
section: Added
---

## en

- Added mobile settings write entries for Host settings, credentials, Cloud Agent connections and IM app authorization. Settings edits use an optimistic revision with a reload prompt on conflict; credentials are written by reference and never shown again; Cloud Agent credentials are imported and activated from the app; IM app authorization walks through credentials or QR setup with a visible attempt status ([#1](https://github.com/skyc10/DeepSeekBot/issues/1)).

## zh

- 新增主机设置、凭据、云 Agent 连接与 IM 应用授权的移动端设置写入口。设置修改带乐观版本号，冲突时提示重新加载；凭据按引用写入且不再回显；云 Agent 凭据可在应用内导入并启用；IM 应用授权按凭据或扫码流程进行，并显示尝试状态（[#1](https://github.com/skyc10/DeepSeekBot/issues/1)）。
