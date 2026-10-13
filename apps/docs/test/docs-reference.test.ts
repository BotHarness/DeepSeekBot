import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { collectDevReference } from "../../../scripts/docs-reference.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("generated developer reference", () => {
  const reference = collectDevReference(ROOT);

  it("extracts the core config from its schema and defaults", () => {
    expect(reference.config).toEqual([
      {
        name: 'privateInputWebUrl',
        type: 'string',
        default: undefined,
        description:
          'Explicit credential-free Web origin for IM private input links; never use a login token URL.',
        source: 'packages/core/src/plugin.ts',
      },
      {
        name: "privateInputExecution",
        type: "boolean",
        default: false,
        description:
          "Removed. The Docker-protected Profile no longer exists; a Profile that sets this starts as an ordinary Profile and logs a warning.",
        source: "packages/core/src/plugin.ts",
      },
      {
        name: "enabled",
        type: "boolean",
        default: true,
        description: "启用 BotHarness core",
        source: "packages/core/src/plugin.ts",
      },
      {
        name: "activityDetailConsumers",
        type: "string[]",
        default: [],
        description:
          "Explicitly trusted Host Plugin names allowed to read Activity Tool details",
        source: "packages/core/src/plugin.ts",
      },
      {
        name: "agentPreset",
        type: "string",
        default: "standard",
        description:
          "PersonaBot 会话加入的 DSH agent preset（提供 file/Shell/grep 等普通工具）",
        source: "packages/core/src/plugin.ts",
      },
      {
        name: "marketplaceUrl",
        type: "string",
        default: "https://market.botharness.ai",
        description: "Bot Marketplace 服务地址",
        source: "packages/core/src/plugin.ts",
      },
      {
        name: "telemetry",
        type: "boolean",
        default: true,
        description:
          "发送匿名使用统计（Anonymous usage telemetry）；DO_NOT_TRACK=1 或 BOTHARNESS_TELEMETRY=0 也会关闭",
        source: "packages/core/src/plugin.ts",
      },
    ]);
  });

  it("publishes no model-visible memory tools in V1", () => {
    expect(reference.tools).toEqual([]);
  });

  it("publishes DSH consumers and the safe application Activity event, not BotStateEvent", () => {
    expect(
      reference.publicEvents.map(({ name, direction, operation }) => ({
        name,
        direction,
        operation,
      })),
    ).toEqual([
      { name: "agent/assistant-stream", direction: "consumes", operation: "on" },
      { name: "agent/created", direction: "consumes", operation: "on" },
      { name: "agent/disposed", direction: "consumes", operation: "on" },
      { name: "agent/inbox/discarded", direction: "consumes", operation: "on" },
      { name: "agent/pre-step", direction: "consumes", operation: "on" },
      { name: "agent/status", direction: "consumes", operation: "on" },
      { name: "approval/request", direction: "consumes", operation: "on" },
      { name: "botharness/personabot/activity", direction: "emits", operation: "emit" },
      { name: "session/event", direction: "consumes", operation: "on" },
      { name: "tools/execute", direction: "consumes", operation: "on" },
      { name: "tools/execute", direction: "consumes", operation: "on" },
      { name: "tools/execute", direction: "consumes", operation: "on" },
      { name: "tools/pre-execute", direction: "consumes", operation: "on" },
      { name: "tools/result", direction: "consumes", operation: "on" },
      { name: "user-questions/request", direction: "consumes", operation: "on" },
    ]);
  });
});
