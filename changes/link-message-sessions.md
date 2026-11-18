---
section: Changed
---

## en

- A Bot now links its receipt to the Assignments it starts after sending it: it replies first, starts the Assignments, then links that message to them with the new `link_message_sessions` tool. One message can link several Assignments, including ones started in a later step or turn, and the links appear on the message as they are added. `bot_send_message` no longer takes `session_ids`.

## zh

- Bot 现在先回执、再启动 Assignment，最后用新的 `link_message_sessions` 工具把这条回执绑定到这些 Assignment 上。一条消息可以绑定多个 Assignment，包括之后的步骤或回合才启动的，绑定后会实时显示在消息上。`bot_send_message` 不再接受 `session_ids`。
