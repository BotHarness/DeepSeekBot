# UI 状态订阅

[English](ui-state.md)

桌面客户端有一个共享 store（`packages/client/src/client/store.ts` 里的 `ClientState`）。Bot 工作时它一直在变：流式草稿帧、Bot 活动、roster 预览、提醒计数。组件订阅的任何内容一变就会重新渲染，所以**组件只订阅自己读取的字段，其他一概不订阅。**

## 规则

1. **按字段选择，并带类型。** 通过 `useClientStore(selector, equal)` 或 `useClientFields(keys)` 读取 store。选择器只返回组件读取的内容，类型为 `Pick<ClientState, ...>` 或一个小的派生值；`equal` 只比较这些字段（逐字段比较引用、`shallowEqual`，或 `sameBotFaces` 这类专用比较）。这就是 zustand 的选择器模式；`useClientStore` 实现了 DSH 的 `SnapshotSelectorHook`。
2. **大的切片只选用到的部分。** `activityList`、`conversation`、`roster` 等对象会因为很多原因变化。只选子字段或派生值（例如 `state.activityList.channelUnread`，或 `resolveChannelSidebarContext(state)?.botSlug`），不要选整个对象。
3. **不要把整颗 state 往下传。** 需要 store 数据的子组件自己选择，或通过 props 接收具体的值。需要多个字段的函数，参数类型写成 `Pick<ClientState, ...>`（例如 `ConversationStateView`），这样类型检查会列出它读了哪些字段；如果新读了一个订阅方没选的字段，编译会直接报错。
4. **保持选择稳定。** 选择器和字段列表定义在模块级或做 memo；组件显示的内容没变时返回原来的值。store 的 setter 会跳过没有任何变化的补丁，不要为了绕过它而强行创建新对象。
5. **小的专用 store 不受此限。** 只保存某一个视图状态的专用 store（偏好设置、feed、controller 等）可以用 `useSyncExternalStore` 整体读取。

## 禁止的写法

`pnpm lint`（source policy 的 `store-subscription` 类）会拒绝 `packages/client/src` 中的以下写法：

- 对客户端 store 使用 `useSyncExternalStore(store.subscribe, store.getSnapshot)`，包括类型标注为 `ClientStore` 的参数或属性。
- `useClientStore(keepClientState, ...)`、`useStoreSlice(source, keepClientState, ...)`，或原样返回参数的选择器。
- 类型为 `state: ClientState` 的 prop 或接口成员。

静态规则只能拦截这些写法，无法证明选择已经最小。render 基准测试负责运行时把关：`client-store-main-render-bench`、`client-store-render-bench`、`client-store-inbox-render-bench`，以及 `bot-sidebar.test.ts` 里的侧栏渲染测试。它们断言：某个界面不显示的写入，引起的 commit 次数为 0。如果改动给热点界面新增了订阅方，要同步扩展对应的基准测试。

## 评审要点

对每个读取客户端 store 的改动组件，确认：

- 它渲染什么，需要哪些 store 字段？选择器只返回这些，不多不少。
- 流式草稿帧、其他 Bot 的活动、Inbox 分页加载、roster 写入，如果它都不显示，会不会让它重新渲染？
- 如果它把 store 数据传给子组件，子组件的类型是 `Pick<...>` 或具体的值吗？
