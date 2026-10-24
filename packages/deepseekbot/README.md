# Tobs — legacy DeepSeekBot entry

DeepSeekBot is now **Tobs / 托布**. New installations should use `npm install -g tobs`, then `tobs --help`.

This package preserves the `deepseekbot` command and existing DSH Bundle entry for installed users and scripts. Both commands use the same release implementation, configuration, permissions and data. Existing Profiles can keep their Bundle entry; do not create another Profile or copy data for the rename.

Update both packages to the same version when keeping both global commands. Each package owns its own executable, so uninstalling one leaves the other available.

## 中文

DeepSeekBot 现已更名为 **Tobs／托布**。新用户请安装 `npm install -g tobs`，使用 `tobs --help` 查看命令。

此包仅保留旧版 `deepseekbot` 命令和 DSH Bundle 入口的兼容性。已有 Profile、配置、权限和数据保持不变，无需重新创建或迁移。若保留两个全局命令，请一起升级到相同版本；卸载任一入口不影响另一个。

[Website / 官网](https://tobs.app/en/)
