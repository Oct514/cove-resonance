# Cove Resonance 从零部署教程

这份教程面向第一次部署 Cove Resonance 的人。目标是完成下面这一条链：

```text
网易云一起听 ChatRoom
        ⇅
      VPS
   Cove Bridge
        ⇅
   ChatGPT Listener
```

你不需要额外购买一个大模型 API。AI 仍然工作在支持 MCP Apps 的 ChatGPT 客户端里。

---

## 1. 先理解三个组件

### Bridge

Bridge 是服务端核心，负责：

- 接收网易云 NIM ChatRoom 事件；
- 把事件放进 Conversation / State 队列；
- 给 Listener 发 SSE wake；
- 把事件通过 MCP tool 交给 Listener；
- 记录 reply route；
- 把 ChatGPT 回复重新发送回网易云。

### Listener

Listener 是一个 MCP App Widget。

它不会自己生成回复。它只做两件事：

1. 收到 SSE wake 后调用 `cove_bridge_sync`；
2. 将取到的事件依次通过 `ui/update-model-context` 和 `ui/message` 投进当前 ChatGPT 对话。

### NetEase Together Worker

Worker 负责网易云「一起听」侧：

- 判断当前是否在一起听房间；
- 建立 NIM ChatRoom realtime；
- 收取房间文本；
- 发送回复；
- 读取当前歌曲、播放状态和歌词；
- 以 NIM realtime 为播放状态主数据源，并在断线时回退到 HTTP reconcile；
- 执行 PAUSE / PLAY / GOTO / NEXT，并等待 realtime 确认；
- 修改 Together `displayList`，并通过 playlist 回读确认队列变更；
- 为模型补充完整歌词上下文。

---

## 2. 推荐环境

当前已验证：

```text
Ubuntu 22.04
Node.js 22.x
npm
2 vCPU / 2 GB RAM 起步
```

只跑 Bridge 时资源需求不高。

如果未来同一台机还要跑 Chrome Listener、Xvfb、noVNC，建议 4 GB RAM。

> 如果 VPS 还要直接登录 ChatGPT，请先确认 VPS 所在地区是 ChatGPT 官方支持地区。Bridge 本身不要求和 Listener 在同一台机器。

---

## 3. 下载并测试代码

```bash
git clone https://github.com/yanceydaisy/cove-resonance.git
cd cove-resonance

npm install
npm test
npm run build
```

只有测试和 build 都通过后再继续。

---

## 4. 配置环境变量

复制模板：

```bash
cp .env.example .env
chmod 600 .env
```

最常用配置：

```dotenv
PORT=8787
BRIDGE_PUBLIC_ORIGIN=https://bridge.example.com

TOGETHER_ENABLED=true
TOGETHER_POLL_INTERVAL_MS=4000
TOGETHER_HEARTBEAT_INTERVAL_MS=10000

NETEASE_COOKIE=MUSIC_U=...
```

### BRIDGE_PUBLIC_ORIGIN

必须是 Listener 能访问到的 HTTPS origin，例如：

```text
https://bridge.example.com
```

不要带 `/mcp`。

它会被用于：

- MCP App CSP `connectDomains`
- Listener SSE endpoint
- Widget 的稳定网络权限

### NETEASE_COOKIE

使用你自己的网易云登录会话 Cookie。

至少应包含：

```text
MUSIC_U=...
```

推荐：

- 使用专门的测试账号；
- 只保存在服务器；
- 文件权限设为 `600`；
- 永远不要提交 Git；
- 不要贴到 Issue、日志或截图里。

### NETEASE_INVITER_UID

可选。用于限制自动处理某个邀请者：

```dotenv
NETEASE_INVITER_UID=123456789
```

### BRIDGE_INGEST_TOKEN

可选但推荐，用于保护通用 `POST /events`：

```dotenv
BRIDGE_INGEST_TOKEN=use-a-long-random-value
```

它和 Listener SSE session token 不是同一个东西。

---

## 5. 本地启动

```bash
set -a
source .env
set +a

npm start
```

检查：

```bash
curl http://127.0.0.1:8787/
```

应看到类似：

```json
{
  "ok": true,
  "service": "cove-bridge"
}
```

---

## 6. 配 HTTPS

ChatGPT 需要访问公网 MCP endpoint，因此实际使用时应提供 HTTPS。

Caddy 示例：

```caddy
bridge.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

然后有两个兼容入口：

```text
https://bridge.example.com/mcp
https://bridge.example.com/mcp/music
```

`/mcp` 是旧版兼容入口，保留完整 Music V2 工具面；新部署如果只使用网易云能力，推荐 `/mcp/music`，它只消费 `netease.*` 事件。

SSE 地址由 Bridge 自动给 Widget：

```text
https://bridge.example.com/listener/events
```

SSE 不直接携带聊天正文，只发送 wake 信号。

---

## 7. 用 systemd 常驻

示例：

```ini
[Unit]
Description=Cove Resonance
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=cove
WorkingDirectory=/opt/cove-resonance
EnvironmentFile=/opt/cove-resonance/.env
ExecStart=/usr/bin/node /opt/cove-resonance/dist/src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

安装：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cove-resonance
sudo systemctl status cove-resonance
```

查看日志：

```bash
journalctl -u cove-resonance -f
```

---

## 8. 在 ChatGPT 中连接

在支持 MCP Apps 的 ChatGPT 环境中添加你的 MCP server。新部署推荐：

```text
https://bridge.example.com/mcp/music
```

已有部署继续使用下面这个旧入口也完全兼容：

```text
https://bridge.example.com/mcp
```

然后在目标对话里挂载 Cove Resonance。

Bridge Widget 默认是静止状态，不会自动监听。

点击：

```text
开始监听
```

正常时状态应变成：

```text
SSE 实时监听中。
```

空闲时：

```text
SSE 实时监听中，暂无新事件。
```

如果 SSE 暂时断开，Widget 会自动重连，同时保留 60 秒 fallback poll。

---

## 9. 第一次端到端测试

建议第一次只测一句非常容易辨认的文本：

```text
Cove Bridge test 001
```

在网易云一起听 ChatRoom 发送后，应该出现：

```text
网易云
  ↓ NIM realtime
Bridge Conversation Stream
  ↓ SSE wake
Listener
  ↓ ui/message
ChatGPT 当前对话
```

不同 ChatGPT Host 对 `ui/message` 的交互可能不同：有的 Host 会直接投递，有的 Host 会要求用户确认。这个差异属于 Host 能力，不是 Bridge 协议本身。

如果 Host 已经把 `ui/message` 交给用户确认，而用户选择取消，Listener 会调用 `cove_bridge_dismissed`。该事件随后进入 terminal 状态，不再 release、不再复活，也不会继续占住 required-reply backpressure。

如果该事件需要回复，模型应调用：

```text
cove_bridge_reply
```

然后：

```text
ChatGPT
  ↓ cove_bridge_reply
Bridge
  ↓ NIM ChatRoom send
网易云
```

---

## 10. 为什么同一句不会无限循环

项目现在有多层幂等保护。

### 网易云入口去重

同一个 NIM `messageId` 只进入 Bridge 一次。

### Queue eventId 去重

相同 `eventId` 不会重复创建。

### Widget 显示去重

Widget 记住已经真正通过 `ui/message` 投递过的 eventId。

如果：

```text
ui/message 已成功
但 cove_bridge_delivered ACK 失败
```

Widget 只会重试 ACK，不会再次把同一句显示给模型。

### Reply 去重

回复带 fingerprint、sentCount 和 completed 状态。

网络失败后可以从未发送的气泡继续，而不是从第一条重新发送。

---

## 11. Conversation Stream 和 State Stream

这两个不要混在一起。

### Conversation

适合：

- 用户聊天；
- 需要回复的消息；
- 必须保持顺序的事件。

特点：

```text
FIFO
不合并
required reply 可形成 backpressure
```

### State

适合：

- 换歌；
- 暂停 / 播放；
- 房间状态；
- 当前播放状态。

特点：

```text
latest-state-wins
旧 pending state 会被新 state 覆盖
```

原因很简单：

> 对话要记忆，状态要新鲜。

---

## 12. 歌词上下文

换歌后 Bridge 会读取当前歌曲可获得的歌词字段，包括普通歌词以及可用的翻译、罗马音、逐字歌词数据。

完整歌词只作为隐藏模型上下文，作用是帮助理解整首歌。

它不代表“当前唱到哪”。

当前播放位置应由 realtime / playback state 决定。

### 播放控制为什么必须等确认

Music V2 提供：

```text
netease_together_pause
netease_together_resume
netease_together_goto
netease_together_next
netease_together_enqueue_next
```

PAUSE / RESUME / GOTO 不会把“HTTP report 成功”直接当成播放成功。Bridge 会等待匹配的 NIM realtime 事件，并校验 `clientSeq`、`serverSeq`、发送者和目标歌曲。

`GOTO` 只允许切到当前 Together `displayList` 中已经存在的歌曲；如果目标不在列表里，会要求先 enqueue，避免假成功。

`ENQUEUE_NEXT` 修改队列后会重新读取 Together playlist，只有确认目标歌曲紧跟当前歌曲、且队列版本符合预期，才返回成功。

---

## 13. SSE 为什么只负责 wake

没有采用：

```text
SSE → 直接把完整聊天消息塞进 Widget
```

而是：

```text
SSE wake
  ↓
cove_bridge_sync
  ↓
Queue reserve
```

这样断线、重连、重复 wake 都不会破坏：

- reservation；
- queue ordering；
- reply lock；
- dedupe；
- backpressure。

SSE 丢一次也没关系：重连时会再次 sync，60 秒轮询也是最后兜底。

---

## 14. VPS Listener（可选）

仓库里有：

```text
ops/vps-listener/
```

它提供：

- Xvfb
- Openbox
- Chrome persistent profile
- x11vnc
- noVNC
- systemd

用途是让 Listener 浏览器长期运行在 VPS。

注意：

1. VPS 所在地区必须适合正常访问 ChatGPT；
2. `5901`、`6080`、`9222` 必须只监听 `127.0.0.1`；
3. noVNC 建议只通过 SSH tunnel 使用；
4. Chrome profile 包含登录状态，绝对不能提交仓库。

---

## 15. 常见问题

### Widget 显示 Runtime error

先确认生成出来的 Widget JS 本身可解析：

```bash
npm test
npm run build
```

项目测试会从生成 HTML 中抽出 `<script>` 并做语法检查。

### 一条消息被处理多次

检查日志里是否：

- NIM 收到同一个 `messageId` 多次；
- 某个 event 在 delivered 前反复 release；
- 同时开了多个 Listener。

当前版本已有 NIM messageId 去重和 Widget eventId 去重，但不要同时启动多个独立 Listener 去消费同一个队列。

### SSE 一直重连

检查：

- `BRIDGE_PUBLIC_ORIGIN` 是否正确；
- HTTPS 证书是否正常；
- MCP App CSP 是否包含该 origin；
- `/listener/events` 是否能保持 streaming；
- reverse proxy 是否对流式响应做了错误 buffering。

### 网易云消息收不到

先看：

```bash
journalctl -u cove-resonance -f
```

正常连接应出现类似：

```text
NetEase NIM realtime connected
```

### 服务重启后队列不见了

这是当前已知限制。

目前 Conversation / State queue 仍在内存里，进程重启后未完成事件不会保留。

SQLite 持久化已经在 roadmap 中。

---

## 16. 当前 roadmap

推荐顺序：

1. SQLite 持久化 Conversation / reply route；
2. Listener watchdog / 自动恢复；
3. 更清晰的 multi-listener 语义；
4. 单机一体化 VPS 部署；
5. 更通用的外部入口适配器。

Bridge 的核心不应该绑定死在网易云。

网易云只是第一个入口。

未来理论上可以继续接：

```text
Telegram
网页
Home App
其他事件源
        ↓
统一 Bridge Event
        ↓
同一个 Listener / Reply Route
```

---

如果你只是想先跑通，不要一上来同时改 NIM、SSE、Widget 和队列。

最稳的排错顺序永远是：

```text
Health
→ MCP
→ Widget
→ /events 手工事件
→ Listener
→ SSE
→ NetEase NIM
→ 双向 reply
```

每一层单独验收，再往下一层叠。
