# 私有中继标准

私有中继标准让一个只需出站连接的服务，为多台无法被外部直连的电脑转发加密手机通道。任何人都可以实现兼容的中继。`deploy/private-relay` 中的 Go 中继 `tobs-relay` 是参考实现。中继只转发密文。谁能控制电脑取决于电脑固定的 Noise 密钥和对准确设备的批准。

本页描述 `botharness-private-v3`。每台电脑为自己的认领启用 v3 之前，v3 中继仍接受其 v1 和 v2 请求。

在[真机验收 #3746](https://github.com/BotHarness/DeepSeekBot/issues/3746) 通过前，旧版 Node 和 Caddy 部署及其 Node 服务端测试仅用于回退。下文的一致性测试脚本也可验证 Go 参考实现。

## 角色与密钥

- **认领密钥**：64 位小写十六进制，每台电脑一个，只能用一次。由运维在中继侧生成，私下交给一台电脑。v1 的初始设置密钥（`bootstrap.secret`）就是名为 `default` 的电脑的认领密钥。
- **所有者令牌**和**手机令牌**：各 64 位小写十六进制，由电脑在认领时生成。所有者令牌用来打开电脑的控制连接；手机令牌放在配对码里，只允许手机进入这台电脑。
- 中继**只保存** 认领密钥、所有者令牌和手机令牌的 **SHA-256 哈希**，并用恒定时间比较。所有者令牌和手机令牌在整个部署内必须唯一，因为中继只凭令牌找到对应的电脑。

## HTTP 接口

生产环境一律用 HTTPS。响应为 JSON，带 `cache-control: no-store`。

| 请求                                                                                                  | 认证                                 | 结果                                                                                                                             |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                                                                         | 无                                   | `200 {"protocol":"botharness-private-v1","protocols":["botharness-private-v1","botharness-private-v2","botharness-private-v3"]}` |
| `POST /claim`，正文 `{"ownerToken":"<64 lowercase hex>","phoneToken":"<64 lowercase hex>"}`（≤1 KiB） | `Authorization: Bearer <认领密钥>`   | `200 {"claimed":true,"host":"example-host"}`；`403` 未知密钥；`409` 密钥已用过（释放后也一样）；`400` 格式错误或令牌重复         |
| `DELETE /claim`                                                                                       | `Authorization: Bearer <所有者令牌>` | `200 {"released":true}`：关闭这台电脑的所有连接并忘掉它的令牌；认领密钥仍视为已用                                                |
| `GET /status`                                                                                         | `Authorization: Bearer <所有者令牌>` | `200 {"connected":true,"host":"example-host"}`；否则 `404`                                                                       |

认领按电脑互斥：同一把密钥的两个并发认领恰好一个得到 `200`，之后用这把密钥的认领一律 `409`，中继重启后也一样。

## WebSocket 接口

- `GET /host`（升级），`Authorization: Bearer <所有者令牌>`：电脑的控制连接。每台电脑最多一个，第二个以 `403` 拒绝。
- `GET /botharness-device/channel`（升级），手机令牌放在 `Authorization: Bearer` 或 `X-BotHarness-Admission`：手机通道。令牌未知、这台电脑的控制连接未打开、或这台电脑已有 32 个手机通道时以 `403` 拒绝。

手机通道只会转发到拥有该手机令牌的电脑。帧为文本，最大 70,000 字节，对中继不透明（都是 Noise 密文）。

## 控制连接消息

JSON 文本帧，`id` 是中继为每个手机通道生成的 32 位小写十六进制。

- 中继 → 电脑：手机连上时 `{"type":"open","id":"0123456789abcdef0123456789abcdef"}`；手机的每一帧 `{"type":"data","id":"0123456789abcdef0123456789abcdef","data":"<Noise ciphertext>"}`；手机离开时 `{"type":"close","id":"0123456789abcdef0123456789abcdef"}`。
- 电脑 → 中继：`{"type":"data","id":"0123456789abcdef0123456789abcdef","data":"<Noise ciphertext>"}` 发给那台手机；`{"type":"close","id":"0123456789abcdef0123456789abcdef"}` 关闭它。

Host 请求关闭手机通道时，中继会在时限内按顺序发送已排队的帧，然后关闭通道。控制连接关闭时，中继关闭这台电脑的全部手机通道。格式错误的控制帧会关闭控制连接。中继每 25 秒发一次 ping，未回应或发送队列超过 2 MiB 的连接会被断开。Go 参考实现最多等待 50 秒来写入一帧或在关闭前发送队列中的帧。

以上 ID 为示例；`<Noise ciphertext>` 代表实际加密帧，不是可直接发送的消息内容。

## V3 设备准入

`GET /health` 的 `protocol` 仍为 `botharness-private-v1`，`protocols` 在 v1 和 v2 后列出 `botharness-private-v3`。v3 电脑在通过认证的 `GET /host` 升级请求中发送 `X-BotHarness-Relay-Protocol: botharness-private-v3`。仅在中继的 `101` 响应回传此标头时，电脑才使用 v3 控制消息。v1/v2 中继继续使用原有的共享令牌。

每次协商出 v3 控制连接后，中继先拒绝手机升级，直到 Host 提交完整的准入集合。准入集合变更时，Host 再提交一次。

- Host → 中继：`{"type":"admissions","id":"<32 位小写十六进制>","entries":[{"hash":"<64 位小写十六进制>"},{"hash":"<64 位小写十六进制>","expiresAt":1795500000000}]}`。
- 中继 → Host：原子写入集合并对新旧连接应用后，发送 `{"type":"admissions-ack","id":"<相同的 id>"}`。

集合最多包含 1,024 个不同的哈希，可以为空。哈希值是对令牌的 64 位小写十六进制文本计算 SHA-256，再用小写十六进制编码。`expiresAt` 是临时邀请的毫秒级 Unix 时间戳，最多允许比当前时间晚 11 分钟，以容纳有效期为 10 分钟的邀请和时钟偏差。电脑之间的永久准入项可设置 `peer: true`。删除此项后，新连接会被拒绝，已打开的通道可完成最后一次交换。Host 仍在 Noise 内校验电脑关系状态。

更新无效或存储失败时，中继关闭控制连接。认领写入 v3 集合后，原共享令牌失效，此后控制连接必须协商 v3。重启时中继从磁盘读取准入集合，并等待 Host 同步后才允许手机接入。离线期间撤销的设备会从下次同步中排除。

BotHarness 为每个配对邀请生成独立的随机准入令牌，撤销设备时取消尚未过期的中继邀请。已配对设备持有 `id.secret` 凭据，其重连令牌通过 HMAC-SHA-256 派生，密钥是 `secret` 的 UTF-8 文本经 SHA-256 算出的 32 字节摘要，消息是紧凑 JSON 数组 `["botharness-private-v3", origin, id]` 的 UTF-8 文本，其中 `origin` 为准确的 HTTPS 来源。输出使用小写十六进制。中继只在升级请求时接收派生令牌，持久化时只保存其哈希。应用流量继续由设备凭据和固定密钥的 Noise 通道授权。

升级 Host 前应先更新手机和浏览器 Client。已更新的 Client 会先用已有配对保存的令牌，若升级在连接打开前被拒绝，再尝试派生令牌。新 v3 配对只在配对时使用邀请令牌，之后使用派生令牌。手机可在离线时完成迁移，上线后无需重新扫码。旧版 App 必须先更新才能连接启用了 v3 的 Host。已迁移的认领若回退到旧版中继，原共享令牌仍然失效。

## 一致性测试

`deploy/private-relay/conformance.mjs` 从外部检查一个正在运行的中继：

```bash
cd deploy/private-relay && npm ci
node conformance.mjs --origin https://relay.example.com --key-a-file a.secret --key-b-file b.secret
```

请使用两把未用过的认领密钥。脚本会认领两台电脑、检查路由隔离，并验证已释放的密钥不能再次认领。对 v3 中继还会检查原共享令牌失效，以及撤销一部手机后，同一台电脑上另一部手机仍能重连并收发数据。最后输出 `conformance: pass`，或逐条列出失败的检查。
