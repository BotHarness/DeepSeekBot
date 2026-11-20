import { icons as hugeicons } from "@iconify-json/hugeicons";
import { addCollection, Icon } from "@iconify/react";
import { Badge } from "@/components/coss/badge";
import { Button } from "@/components/coss/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/coss/card";
import { Frame, FramePanel } from "@/components/coss/frame";
import { Group, GroupSeparator, GroupText } from "@/components/coss/group";
import { Separator } from "@/components/coss/separator";

addCollection(hugeicons);

const GITHUB_URL = "https://github.com/BotHarness/BotHarness";

const STATE_BADGES = [
  { label: "thinking", variant: "info" },
  { label: "working", variant: "default" },
  { label: "waiting", variant: "warning" },
  { label: "blocked", variant: "error" },
  { label: "done", variant: "success" },
  { label: "idle", variant: "outline" },
] as const;

const COPY = {
  en: {
    badge: "BotHarness · DSH plugin layer",
    headline: "A persistent identity for LLM agents",
    lede: "PersonaBot — a bot with a persona, memory across sessions, and the ability to work concurrently. BotHarness turns the Bot into a first-class entity on DeepSeek Harness.",
    buildNote: "Built from source · no npm package yet",
    quickstart: "Quickstart",
    architecture: "Architecture & data flow",
    pathsHeading: "Three paths",
    paths: [
      {
        href: "/docs/overview",
        icon: "hugeicons:book-02",
        eyebrow: "For users",
        title: "Docs",
        description: "What BotHarness is and how to get started — overview and quickstart.",
      },
      {
        href: "/dev",
        icon: "hugeicons:code",
        eyebrow: "For developers",
        title: "Development & Audit",
        description: "Architecture, data flow, ADRs, and the platform spec — for contributors and auditors.",
      },
      {
        href: "/changelog",
        icon: "hugeicons:time-04",
        eyebrow: "Timeline",
        title: "Changelog",
        description: "What changed in every version, newest first.",
      },
    ],
    capabilitiesHeading: "Core capabilities",
    capabilities: [
      { title: "PersonaBot", detail: "An independent persona that persists across sessions and group chats." },
      { title: "Memory as files", detail: "Markdown + front-matter: readable, editable, revertible." },
      { title: "Visible state", states: STATE_BADGES },
      { title: "No fork, no rebuild", detail: "A plugin layer on DSH; channels and routing reuse dsh-im." },
    ],
    recentHeading: "Recent changes",
    all: "All →",
  },
  zh: {
    badge: "BotHarness · DSH 插件层",
    headline: "给 LLM agent 一份持久身份",
    lede: "PersonaBot —— 带人格、跨 session 记忆、可并发工作的 Bot。BotHarness 把「BOT」变成 DeepSeek Harness 上的一等实体。",
    buildNote: "从仓库构建 · npm 包未发布",
    quickstart: "快速开始",
    architecture: "架构与数据流",
    pathsHeading: "三条路径",
    paths: [
      {
        href: "/docs/overview",
        icon: "hugeicons:book-02",
        eyebrow: "作为使用者",
        title: "用户文档",
        description: "BotHarness 是什么、怎么上手 —— 从总览与快速开始进入。",
      },
      {
        href: "/dev",
        icon: "hugeicons:code",
        eyebrow: "作为开发者",
        title: "开发与审计",
        description: "架构、数据流、BotHarness 产品术语与 ADR，面向贡献者与审计者。",
      },
      {
        href: "/changelog",
        icon: "hugeicons:time-04",
        eyebrow: "发展时间线",
        title: "Changelog",
        description: "每个版本改了什么，一行一条，按时间倒序。",
      },
    ],
    capabilitiesHeading: "核心能力",
    capabilities: [
      { title: "PersonaBot", detail: "独立人格，跨 session、跨群聊持续存在。" },
      { title: "记忆即文件", detail: "Markdown + front-matter，可读可改可回滚。" },
      { title: "状态可见", states: STATE_BADGES },
      { title: "不 fork，不重建", detail: "DSH 之上的插件层，通道与路由复用 dsh-im。" },
    ],
    recentHeading: "最近变更",
    all: "全部 →",
  },
} as const;

interface RecentEntry {
  title: string;
  href: string;
  date: string;
}

interface Props {
  recent: RecentEntry[];
  lang?: "en" | "zh";
}

export default function Landing({ recent, lang = "en" }: Props) {
  const t = COPY[lang];
  const prefix = lang === "zh" ? "/zh" : "";

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto w-full max-w-5xl px-4 pb-4 sm:px-6"
    >
      <section className="flex max-w-3xl flex-col items-start gap-5 border-b border-border py-12 sm:py-16">
        <Badge variant="outline">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: "var(--bh-brand-strong)" }}
          />
          {t.badge}
        </Badge>

        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t.headline}
        </h1>

        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty sm:text-base">
          {t.lede}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <GroupText className="font-mono text-xs text-foreground">
            <span aria-hidden="true" className="text-muted-foreground">
              $
            </span>
            {"pnpm install && pnpm build"}
          </GroupText>
          <span className="text-xs text-muted-foreground">{t.buildNote}</span>
        </div>

        <Group>
          <Button render={<a href={`${prefix}/docs/quickstart`} />}>
            {t.quickstart}
          </Button>
          <GroupSeparator />
          <Button
            variant="outline"
            render={<a href={`${prefix}/dev`} />}
          >
            {t.architecture}
          </Button>
        </Group>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Button
            variant="link"
            size="sm"
            render={
              <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" />
            }
          >
            GitHub
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-b border-border py-10">
        <h2 className="text-lg font-semibold tracking-tight">
          {t.capabilitiesHeading}
        </h2>
        <Frame>
          <FramePanel className="grid gap-x-6 gap-y-4 border-[color:var(--bh-border)] p-4 transition-colors hover:border-[color:var(--bh-border-hover)] sm:grid-cols-2 lg:grid-cols-4">
            {t.capabilities.map((capability) => (
              <div key={capability.title} className="flex flex-col gap-1">
                <span className="text-sm font-medium">{capability.title}</span>
                {"detail" in capability ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {capability.detail}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {capability.states.map((state) => (
                      <Badge key={state.label} size="sm" variant={state.variant}>
                        {state.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </FramePanel>
        </Frame>
      </section>

      <section className="flex flex-col gap-4 border-b border-border py-10">
        <h2 className="text-lg font-semibold tracking-tight">
          {t.pathsHeading}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {t.paths.map((path) => (
            <a
              key={path.href}
              href={`${prefix}${path.href}`}
              className="block h-full rounded-2xl outline-offset-2"
            >
              <Card className="h-full border-[color:var(--bh-border)] transition-colors hover:border-[color:var(--bh-border-hover)]">
                <CardHeader className="gap-2 p-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon
                      icon={path.icon}
                      className="size-4 shrink-0"
                      ssr
                      aria-hidden="true"
                    />
                    <span className="text-[0.6875rem] font-medium tracking-wide uppercase">
                      {path.eyebrow}
                    </span>
                  </div>
                  <CardTitle className="text-base leading-snug">
                    {path.title}
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    {path.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </a>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 py-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">
            {t.recentHeading}
          </h2>
          <a
            href={`${prefix}/changelog`}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t.all}
          </a>
        </div>
        <Frame>
          <FramePanel className="border-[color:var(--bh-border)] p-1 transition-colors hover:border-[color:var(--bh-border-hover)]">
            <ul className="flex flex-col">
              {recent.map((entry, index) => (
                <li key={entry.href} className="flex flex-col">
                  {index > 0 && <Separator />}
                  <a
                    href={entry.href}
                    className="flex items-baseline justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
                  >
                    <span className="text-sm font-medium">{entry.title}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      {entry.date}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </FramePanel>
        </Frame>
      </section>

      <footer className="border-t border-border py-6">
        <p className="font-mono text-xs text-muted-foreground">
          botharness.ai · MIT · © 2026 BotHarness
        </p>
      </footer>
    </main>
  );
}
