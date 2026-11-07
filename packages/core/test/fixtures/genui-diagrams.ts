export const syntheticGenuiDiagrams = [
  {
    id: 'pele-flowchart',
    title: '流程图 · Offline flowchart',
    source:
      'flowchart LR\n A[用户输入] --> B[离线图表编译]\n B --> C[预览与显式发布]\n C --> D[普通消息里的结果]',
    caption: '输入 → 编译 → 预览并显式发布 → 结果。图表不会自动执行操作。',
  },
  {
    id: 'pele-sequence',
    title: '交互顺序 · Sequence',
    source:
      'sequenceDiagram\n participant H as 用户\n participant B as Bot\n participant P as 产品\n H->>B: 查看数据\n B->>P: 编译并预览\n B->>P: 显式发布\n P-->>H: 可视化结果',
    caption: '用户请求；Bot 编译、预览、显式发布；产品展示。预览本身不发布消息。',
  },
  {
    id: 'pele-xychart',
    title: '多系列统计 · Series comparison',
    source:
      'xychart-beta\n title "月度结果 / synthetic"\n x-axis ["一月", "二月", "三月"]\n y-axis "数量" -10 --> 25\n bar [-5, 0, 18]\n line [4, 12, 22]',
    caption:
      '柱形系列（一月 -5，二月 0，三月 18）；折线系列（一月 4，二月 12，三月 22）。使用形状和数字区分，不只依赖颜色。',
  },
] as const;
