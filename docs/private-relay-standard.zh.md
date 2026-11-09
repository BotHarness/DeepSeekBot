# 私有中继标准

私有中继标准让一个只需出站连接的服务，为多台无法被外部直连的电脑转发加密手机通道。任何人都可以实现兼容的中继；`deploy/private-relay` 里的 Docker 中继是参考实现。中继只负责转发：它看不到明文，也不决定谁能控制电脑。决定权仍在电脑固定的 Noise 密钥和对准确设备的批准上。

本页描述 `botharness-private-v2`。v2 中继也接受所有 v1 请求，所以单台电脑的 v1 部署照常工作。

## 角色与密钥

- **认领密钥**：64 位小写十六进制，每台电脑一个，只能用一次。由运维在中继侧生成，私下交给一台电脑。v1 的初始设置密钥（`bootstrap.secret`）就是名为 `default` 的电脑的认领密钥。
- **所有者令牌**和**手机令牌**：各 64 位小写十六进制，由电脑在认领时生成。所有者令牌用来打开电脑的控制连接；手机令牌放在配对码里，只允许手机进入这台电脑。
- 中继**只保存** 认领密钥、所有者令牌和手机令牌的 **SHA-256 哈希**，并用恒定时间比较。所有者令牌和手机令牌在整个部署内必须唯一，因为中继只凭令牌找到对应的电脑。

## HTTP 接口

生产环境一律用 HTTPS。响应为 JSON，带 `cache-control: no-store`。

| 请求                                                        | 认证                                 | 结果                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                               | 无                                   | `200 {"protocol":"botharness-private-v1","protocols":["botharness-private-v1","botharness-private-v2"]}`         |
| `POST /claim`，正文 `{"ownerToken","phoneToken"}`（≤1 KiB） | `Authorization: Bearer <认领密钥>`   | `200 {"claimed":true,"host":<名称>}`；`403` 未知密钥；`409` 密钥已用过（释放后也一样）；`400` 格式错误或令牌重复 |
| `DELETE /claim`                                             | `Authorization: Bearer <所有者令牌>` | `200 {"released":true}`：关闭这台电脑的所有连接并忘掉它的令牌；认领密钥仍视为已用                                |
| `GET /status`                                               | `Authorization: Bearer <所有者令牌>` | `200 {"connected":bool,"host":<名称>}`；否则 `404`                                                               |

认领按电脑互斥：同一把密钥的两个并发认领恰好一个得到 `200`，之后用这把密钥的认领一律 `409`，中继重启后也一样。

## WebSocket 接口

- `GET /host`（升级），`Authorization: Bearer <所有者令牌>`：电脑的控制连接。每台电脑最多一个，第二个以 `403` 拒绝。
- `GET /botharness-device/channel`（升级），手机令牌放在 `Authorization: Bearer` 或 `X-BotHarness-Admission`：手机通道。令牌未知、这台电脑的控制连接未打开、或这台电脑已有 32 个手机通道时以 `403` 拒绝。

手机通道只会转发到拥有该手机令牌的电脑。帧为文本，最大 70,000 字节，对中继不透明（都是 Noise 密文）。

## 控制连接消息

JSON 文本帧，`id` 是中继为每个手机通道生成的 32 位小写十六进制。

- 中继 → 电脑：手机连上时 `{"type":"open","id"}`；手机的每一帧 `{"type":"data","id","data"}`；手机离开时 `{"type":"close","id"}`。
- 电脑 → 中继：`{"type":"data","id","data"}` 发给那台手机；`{"type":"close","id"}` 关闭它。

控制连接关闭时，中继关闭这台电脑的全部手机通道，不影响其他电脑。任何格式错误的控制帧都会关闭控制连接。中继每 25 秒发一次 ping，不回应的连接会被断开；发送队列超过 2 MiB 的连接也会被断开。

## 一致性测试

`deploy/private-relay/conformance.mjs` 从外部检查一个正在运行的中继：

```bash
cd deploy/private-relay && npm ci
node conformance.mjs --origin https://relay.example.com --key-a-file a.secret --key-b-file b.secret
```

请使用两把未用过的认领密钥。脚本会认领两台电脑、连上它们和各自的手机，检查每台手机只能到达自己的电脑、一台电脑离线或释放认领不影响另一台、已释放的密钥不能再次认领。最后输出 `conformance: pass`，或逐条列出失败的检查。
