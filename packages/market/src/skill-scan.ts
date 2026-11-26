import {
  parseSkillDocument,
  renameSkillDocument,
  withSkillDocumentMetadata,
  type SkillDocument,
} from '../../core/src/skills/skill-document.js';
import { uploadFileKind } from './upload-files.js';

export const SKILL_TOPIC = 'tobs-skill';
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
export const MAX_SKILL_NAME = 64;
export const MAX_SKILL_DESCRIPTION = 1024;
export const MAX_SKILL_MD_CHARS = 64_000;
export const MAX_SKILL_FILES = 100;
export const MAX_SKILL_BYTES = 1024 * 1024;

export type SkillScanVerdict = 'clean' | 'warning' | 'blocked';

export type SkillFindingKind = 'secret' | 'prompt-injection' | 'exfiltration' | 'download-exec';

export interface SkillFinding {
  kind: SkillFindingKind;
  path: string;
  line: number;
  severity: 'warning' | 'malicious';
}

export interface SkillScan {
  verdict: SkillScanVerdict;
  findings: SkillFinding[];
  scripts: string[];
}

export interface SkillFrontmatter {
  name: string;
  description: string;
}

interface Rule {
  kind: SkillFindingKind;
  severity: SkillFinding['severity'];
  test(text: string): boolean;
}

const DOWNLOADER = /\b(?:curl|wget|iwr|Invoke-WebRequest)\b/iu;
const HTTP_CLIENT = /\b(?:curl|wget)\b/iu;
const BASE64_DECODE = /base64\s+(?:-d|--decode)/iu;
const SHELL = /^\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/iu;
const PLAIN_SHELL = /^\s*(?:ba|z)?sh\b/iu;
const INTERPRETER = /^\s*(?:python3?|node|perl|ruby)\b/iu;

function pipesIntoExecutor(text: string): boolean {
  const stages = text.split('|');
  for (let index = 1; index < stages.length; index += 1) {
    const from = stages[index - 1]!;
    const into = stages[index]!;
    if (DOWNLOADER.test(from) && SHELL.test(into)) return true;
    if (HTTP_CLIENT.test(from) && INTERPRETER.test(into)) return true;
    if (BASE64_DECODE.test(from) && PLAIN_SHELL.test(into)) return true;
  }
  return false;
}

const matches = (pattern: RegExp) => (text: string) => pattern.test(text);

const RULES: readonly Rule[] = [
  { kind: 'download-exec', severity: 'malicious', test: pipesIntoExecutor },
  {
    kind: 'secret',
    severity: 'warning',
    test: matches(
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})\b/u,
    ),
  },
  {
    kind: 'prompt-injection',
    severity: 'warning',
    test: matches(
      /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier|system)\s+(?:instructions|prompts?|rules)\b|\bdo\s+not\s+(?:tell|inform|show|mention\s+(?:this\s+)?to)\s+the\s+(?:user|human)\b|忽略(?:之前|以上|前面|先前)(?:的|所有)*(?:指令|提示|规则)|不要(?:告诉|告知)(?:用户|人类|主人)/iu,
    ),
  },
  {
    kind: 'exfiltration',
    severity: 'warning',
    test: matches(
      /~\/\.ssh\b|\bid_(?:rsa|ed25519)\b|\.aws\/credentials\b|\.config\/gcloud\b|\.netrc\b|\.dsh\/credentials\b|\b(?:discord(?:app)?\.com\/api\/webhooks|hooks\.slack\.com\/services|webhook\.site|requestbin|ngrok\.io|pastebin\.com)\b/iu,
    ),
  },
];

const MAX_FINDINGS = 50;

export function isScriptPath(path: string): boolean {
  return uploadFileKind(path) === 'script';
}

export function scanSkillFiles(files: readonly { path: string; text: string | null }[]): SkillScan {
  const findings: SkillFinding[] = [];
  const scripts: string[] = [];
  let malicious = false;
  for (const file of files) {
    if (isScriptPath(file.path)) scripts.push(file.path);
    if (file.text === null) continue;
    const lines = file.text.split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      const next = lines[index + 1] ?? '';
      for (const rule of RULES) {
        if (findings.length >= MAX_FINDINGS && (rule.severity === 'warning' || malicious)) continue;
        const own = rule.test(line);
        const across = !own && rule.test(`${line} ${next}`) && !rule.test(next);
        if (!own && !across) continue;
        if (rule.severity === 'malicious') malicious = true;
        findings.push({
          kind: rule.kind,
          path: file.path,
          line: index + 1,
          severity: rule.severity,
        });
      }
    }
  }
  const verdict: SkillScanVerdict = malicious
    ? 'blocked'
    : findings.length > 0
      ? 'warning'
      : 'clean';
  return { verdict, findings, scripts: scripts.sort() };
}

export function renameSkill(text: string, name: string): string {
  return renameSkillDocument(text, name);
}

export function parseSkillFrontmatter(text: string): SkillFrontmatter | undefined {
  let document: SkillDocument | undefined;
  try {
    document = parseSkillDocument(text.replace(/^\uFEFF/u, ''));
  } catch {
    return undefined;
  }
  if (document === undefined || document.name.length > MAX_SKILL_NAME) return undefined;
  const description = document.description.trim();
  if (description.length === 0 || description.length > MAX_SKILL_DESCRIPTION) return undefined;
  return { name: document.name, description };
}

export function withSkillMetadata(text: string, entries: Record<string, string>): string {
  return withSkillDocumentMetadata(text, entries);
}
