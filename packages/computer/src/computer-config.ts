import type { Volatile } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { DEFAULT_DOCKER_CONFIG } from './providers/docker.js';
import type { ComputerTarget } from './target.js';

export interface ComputerConfig {
  target: ComputerTarget;
  enabled: boolean;
  image: string;
  containerName: string;
  volumeName: string;
  hostPort: number;
  cpus: number;
  memory: string;
  resolution: string;
  shmSize: string;
  pidsLimit: number;
  idleStopMinutes: number;
  hardenDesktop: boolean;
  language: string;
  exportDir: string;
  autoAllowActions: boolean;
  dataDir: string;
}

export type ComputerRuntimeConfig = Omit<
  ComputerConfig,
  'exportDir' | 'idleStopMinutes' | 'autoAllowActions' | 'target'
> & {
  target: ComputerTarget | Volatile<ComputerTarget>;
  exportDir: string | Volatile<string>;
  idleStopMinutes: number | Volatile<number>;
  autoAllowActions: boolean | Volatile<boolean>;
};

export function readLive<T>(value: T | Volatile<T>): T {
  return typeof value === 'object' && value !== null && 'get' in value
    ? ((value as Volatile<T>).get() as T)
    : (value as T);
}
export function desktopLocale(language: string): string {
  return /^zh([-_]|$)/i.test(language) ? 'zh_CN.UTF-8' : 'en_US.UTF-8';
}

type ComputerSchemaConfig = Omit<
  ComputerConfig,
  'target' | 'exportDir' | 'idleStopMinutes' | 'autoAllowActions'
> & {
  target: Volatile<ComputerTarget>;
  exportDir: Volatile<string>;
  idleStopMinutes: Volatile<number>;
  autoAllowActions: Volatile<boolean>;
};

export function createComputerConfig(): {
  DEFAULT_CONFIG: ComputerConfig;
  Config: Schema<Partial<ComputerConfig>, ComputerSchemaConfig>;
} {
  const DEFAULT_CONFIG: ComputerConfig = {
    target: 'local',
    enabled: true,
    image: DEFAULT_DOCKER_CONFIG.image,
    containerName: DEFAULT_DOCKER_CONFIG.containerName,
    volumeName: DEFAULT_DOCKER_CONFIG.volumeName,
    hostPort: DEFAULT_DOCKER_CONFIG.hostPort,
    cpus: DEFAULT_DOCKER_CONFIG.cpus,
    memory: DEFAULT_DOCKER_CONFIG.memory,
    resolution: DEFAULT_DOCKER_CONFIG.resolution,
    shmSize: DEFAULT_DOCKER_CONFIG.shmSize,
    pidsLimit: DEFAULT_DOCKER_CONFIG.pidsLimit,
    idleStopMinutes: DEFAULT_DOCKER_CONFIG.idleStopMinutes,
    hardenDesktop: DEFAULT_DOCKER_CONFIG.hardenDesktop,
    language: DEFAULT_DOCKER_CONFIG.language,
    exportDir: '',
    autoAllowActions: false,
    dataDir: '',
  };

  const Config: Schema<Partial<ComputerConfig>, ComputerSchemaConfig> = Schema.object({
    target: Schema.union([Schema.const('local'), Schema.const('container')])
      .default('container')
      .volatile(),
    enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('启用 Computer'),
    image: Schema.string().default(DEFAULT_CONFIG.image),
    containerName: Schema.string().default(DEFAULT_CONFIG.containerName),
    volumeName: Schema.string().default(DEFAULT_CONFIG.volumeName),
    hostPort: Schema.number().default(DEFAULT_CONFIG.hostPort),
    cpus: Schema.number().default(DEFAULT_CONFIG.cpus),
    memory: Schema.string().default(DEFAULT_CONFIG.memory),
    resolution: Schema.string()
      .default(DEFAULT_CONFIG.resolution)
      .description(
        '桌面分辨率上限（Xvfb MAX_RES）；viewer 不缩放画面，需覆盖最大观看画布，默认 2560x1600',
      ),
    shmSize: Schema.string().default(DEFAULT_CONFIG.shmSize),
    pidsLimit: Schema.number().default(DEFAULT_CONFIG.pidsLimit),
    idleStopMinutes: Schema.number().default(DEFAULT_CONFIG.idleStopMinutes).volatile(),
    hardenDesktop: Schema.boolean()
      .default(DEFAULT_CONFIG.hardenDesktop)
      .description(
        '硬化桌面（禁用 sudo/终端/xfce 启动器）；查看专用部署可选开，computer use 需要保持关闭',
      ),
    language: Schema.string().default(DEFAULT_CONFIG.language),
    exportDir: Schema.string()
      .default(DEFAULT_CONFIG.exportDir)
      .description(
        '导出目录；为空时回退到默认目录（~/Desktop/BotHarness Exports，无 Desktop 时为 ~/BotHarness Exports）',
      )
      .volatile(),
    autoAllowActions: Schema.boolean()
      .default(DEFAULT_CONFIG.autoAllowActions)
      .description('自动允许 PersonaBot 操作 Computer（跳过按会话的人工授权）')
      .volatile(),
    dataDir: Schema.string()
      .default(DEFAULT_CONFIG.dataDir)
      .description('持久目录（仅 Linux 生效，bind mount 到 /config；为空时用命名卷）'),
  });

  return { DEFAULT_CONFIG, Config };
}
