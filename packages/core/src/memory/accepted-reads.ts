import {
  isMemoryMarkdown,
  readMemoryMarkdown,
  memoryMarkdownImagePath,
  MAX_MEMORY_MARKDOWN_BYTES,
} from './markdown.js';
import { readMemoryImage, isMemoryImagePath, MemoryImageError } from './image.js';
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { toMemoryRelativePath, resolveMemoryPath } from './jail.js';
import { run, head, MAX_DIFF_BYTES, output, dirty, MAX_FILE_BYTES } from './accepted-git.js';
import { MemoryAcceptError } from './accepted-types.js';
import type {
  MemoryGitCommit,
  MemoryGitCommitDiff,
  MemoryAcceptance,
} from './accepted-types.js';
import { versionNames } from './accepted-versions.js';
import type { RepairRow } from './accepted-repository.js';
import { currentWorkingChanges } from './accepted-observation.js';

export function createMemoryReads({
  assertIdle,
  graphRepository,
  readRepository,
  pendingRepair,
  database,
}: {
  assertIdle: (botSlug: string) => void;
  graphRepository: (botSlug: string) => string;
  readRepository: (botSlug: string) => { root: string; repairing: boolean };
  pendingRepair: (botSlug: string) => RepairRow | undefined;
  database: OperationalDatabaseModulePort;
}): Pick<
  MemoryAcceptance,
  | 'markdownImageFile'
  | 'imageFile'
  | 'readAccepted'
  | 'gitGraph'
  | 'gitCommitDiff'
  | 'workingChanges'
  | 'workingDiff'
> {
  return {
    markdownImageFile(botSlug, path, source, revision, reference) {
      assertIdle(botSlug);
      const root = graphRepository(botSlug);
      const document = readMemoryMarkdown(root, path, source, run);
      if (document.status !== 'ready')
        throw new MemoryImageError(`memory-image-${document.status}`, 'Markdown is unavailable');
      if (document.revision !== revision)
        throw new MemoryImageError('memory-image-stale', 'Markdown changed; refresh the view');
      const imagePath = memoryMarkdownImagePath(path, reference);
      const { image, bytes } = readMemoryImage(root, imagePath, source, run);
      if (image.status !== 'ready' || bytes === undefined)
        throw new MemoryImageError(
          `memory-image-${image.status}`,
          'Image is unavailable or cannot be previewed',
        );
      if (readMemoryMarkdown(root, path, source, run).revision !== revision)
        throw new MemoryImageError('memory-image-stale', 'Markdown changed; refresh the view');
      return bytes;
    },
    imageFile(botSlug, path, source, revision) {
      assertIdle(botSlug);
      if (!/^[0-9a-f]{64}$/u.test(revision))
        throw new MemoryImageError('memory-image-invalid', 'Invalid image content revision');
      const { image, bytes } = readMemoryImage(graphRepository(botSlug), path, source, run);
      if (image.status !== 'ready' || bytes === undefined)
        throw new MemoryImageError(
          `memory-image-${image.status}`,
          'Image is unavailable or cannot be previewed',
        );
      if (image.revision !== revision)
        throw new MemoryImageError('memory-image-stale', 'Image changed; refresh the view');
      return bytes;
    },
    readAccepted(botSlug, path) {
      assertIdle(botSlug);
      const { root } = readRepository(botSlug);
      const relative = toMemoryRelativePath(path);
      const target = resolveMemoryPath(root, relative);
      if (!existsSync(target) || !statSync(target).isFile()) return undefined;
      if (isMemoryMarkdown(relative)) {
        const markdown = readMemoryMarkdown(root, relative, 'worktree', run);
        return {
          path: relative,
          body: markdown.body,
          head: head(root),
          markdown,
          ...(markdown.status === 'ready' ? {} : { binary: true }),
        };
      }
      if (isMemoryImagePath(relative)) {
        return {
          path: relative,
          body: '',
          head: head(root),
          binary: true,
          image: readMemoryImage(root, relative, 'worktree', run).image,
        };
      }
      const fileSize = statSync(target).size;
      if (fileSize > MAX_DIFF_BYTES) {
        return { path: relative, body: '', head: head(root), binary: true };
      }
      const bytes = readFileSync(target);
      let body: string;
      let binary = bytes.includes(0);
      try {
        body = binary ? '' : new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        body = '';
        binary = true;
      }
      return {
        path: relative,
        body,
        head: head(root),
        ...(binary ? { binary: true } : {}),
      };
    },
    gitGraph(botSlug, offset = 0, path) {
      assertIdle(botSlug);
      if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) {
        throw new MemoryAcceptError('memory-invalid', 'Invalid Memory graph offset');
      }
      const root = graphRepository(botSlug);
      const only = path === undefined ? undefined : toMemoryRelativePath(path);
      if (only !== undefined) resolveMemoryPath(root, only);
      const branchMap = new Map<string, string[]>();
      for (const line of output(root, [
        'for-each-ref',
        '--format=%(objectname) %(refname:short)',
        'refs/heads',
      ]).split('\n')) {
        if (line.length === 0) continue;
        const separator = line.indexOf(' ');
        if (separator < 0) continue;
        const sha = line.slice(0, separator);
        branchMap.set(sha, [...(branchMap.get(sha) ?? []), line.slice(separator + 1)]);
      }
      const versions = versionNames(root);
      const currentHead = head(root);
      let currentBranch: string | null;
      try {
        currentBranch = output(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
      } catch {
        currentBranch = null;
      }
      const repairing = pendingRepair(botSlug)?.provisional_head_sha;
      const lines = output(root, [
        'log',
        '--branches',
        'HEAD',
        '--topo-order',
        `--skip=${offset}`,
        '--max-count=61',
        '--format=%H%x1f%P%x1f%s%x1f%aI',
        ...(only === undefined ? [] : ['--', only]),
      ])
        .split('\n')
        .filter(Boolean);
      const displayedShas = lines.slice(0, 60).map((line) => line.slice(0, 40));
      const accepted = database.read((db) => {
        const lookup = db.prepare(
          'SELECT 1 AS found FROM memory_accepted_commits WHERE bot_slug = ? AND sha = ?',
        );
        return new Set(
          displayedShas.filter((sha) => {
            if (!/^[0-9a-f]{40}$/u.test(sha)) return false;
            return lookup.get(botSlug, sha) !== undefined;
          }),
        );
      });
      const commits = lines.slice(0, 60).map((line): MemoryGitCommit => {
        const [sha = '', parents = '', subject = '', authoredAt = ''] = line.split('\x1f');
        if (!/^[0-9a-f]{40}$/u.test(sha))
          throw new MemoryAcceptError('memory-invalid', 'Invalid Memory Git commit');
        return {
          sha,
          parents: parents === '' ? [] : parents.split(' '),
          subject,
          authoredAt,
          branches: branchMap.get(sha) ?? [],
          versions: versions.get(sha) ?? [],
          status: sha === repairing ? 'needs-repair' : accepted.has(sha) ? 'accepted' : 'pending',
        };
      });
      return {
        head: currentHead,
        currentBranch,
        branches: [...branchMap.values()].flat().sort(),
        dirty: dirty(root),
        commits,
        hasMore: lines.length > 60,
      };
    },
    gitCommitDiff(botSlug, sha) {
      assertIdle(botSlug);
      if (!/^[0-9a-f]{40}$/u.test(sha)) {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }
      const root = graphRepository(botSlug);
      let objectType: string;
      try {
        objectType = output(root, ['cat-file', '-t', sha]);
      } catch {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }
      if (objectType !== 'commit') {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }
      const containing = output(root, ['branch', '--contains', sha, '--format=%(refname:short)']);
      let reachableFromHead = false;
      try {
        run(root, ['merge-base', '--is-ancestor', sha, 'HEAD']);
        reachableFromHead = true;
      } catch {}
      if (containing.length === 0 && !reachableFromHead) {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }
      const parents = output(root, ['rev-list', '--parents', '-n', '1', sha]).split(' ').slice(1);
      const firstParent = parents[0];
      const range = firstParent === undefined ? [sha] : [firstParent, sha];
      const nameStatus = run(
        root,
        firstParent === undefined
          ? [
              'diff-tree',
              '--root',
              '--no-renames',
              '--no-commit-id',
              '--name-status',
              '-r',
              '-z',
              sha,
            ]
          : ['diff', '--no-renames', '--name-status', '-z', ...range],
      )
        .toString('utf8')
        .split('\0')
        .filter(Boolean);
      const files: MemoryGitCommitDiff['files'] = [];
      let markdownBudget = MAX_MEMORY_MARKDOWN_BYTES;
      const document = (path: string, source: string) => {
        const result = readMemoryMarkdown(root, path, source, run, markdownBudget);
        markdownBudget -= Buffer.byteLength(result.body, 'utf8');
        return result;
      };
      for (let index = 0; index < nameStatus.length; index += 2) {
        const status = nameStatus[index] ?? '';
        const path = nameStatus[index + 1] ?? '';
        files.push({
          status,
          path,
          ...(isMemoryMarkdown(path)
            ? {
                markdown: {
                  ...(status === 'A' || firstParent === undefined
                    ? {}
                    : { before: document(path, firstParent) }),
                  ...(status === 'D' ? {} : { after: document(path, sha) }),
                },
              }
            : {}),
          ...(isMemoryImagePath(path)
            ? {
                images: {
                  ...(status === 'A' || firstParent === undefined
                    ? {}
                    : { before: readMemoryImage(root, path, firstParent, run).image }),
                  ...(status === 'D' ? {} : { after: readMemoryImage(root, path, sha, run).image }),
                },
              }
            : {}),
        });
      }
      return {
        sha,
        subject: output(root, ['show', '--no-patch', '--format=%s', sha]).slice(0, 200),
        files,
        diff: output(
          root,
          firstParent === undefined
            ? ['show', '--format=', '--no-ext-diff', '--no-textconv', '--no-renames', '--root', sha]
            : ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', ...range],
        ),
      };
    },
    workingChanges(botSlug) {
      assertIdle(botSlug);
      return currentWorkingChanges(graphRepository(botSlug));
    },
    workingDiff(botSlug, path, kind) {
      assertIdle(botSlug);
      if (!['staged', 'unstaged', 'untracked', 'current'].includes(kind)) {
        throw new MemoryAcceptError('memory-invalid', 'Invalid Memory change kind');
      }
      const root = graphRepository(botSlug);
      const relative = toMemoryRelativePath(path);
      const phases = currentWorkingChanges(root).filter((entry) => entry.path === relative);

      const addedThenRemoved =
        phases.some((entry) => entry.kind === 'staged' && entry.status === 'A') &&
        phases.some((entry) => entry.kind === 'unstaged' && entry.status === 'D');
      const change =
        kind === 'current'
          ? phases.length === 0 || addedThenRemoved
            ? undefined
            : {
                path: relative,
                kind,
                status: phases.some((entry) => entry.kind === 'untracked' || entry.status === 'A')
                  ? 'A'
                  : phases.some((entry) => entry.status === 'D')
                    ? 'D'
                    : 'M',
              }
          : phases.find((entry) => entry.kind === kind);
      if (change === undefined) {
        throw new MemoryAcceptError('memory-invalid', 'Memory working change no longer exists');
      }
      const comparisonHead = head(root);
      const markdown = isMemoryMarkdown(relative)
        ? {
            ...(change.status === 'A' || kind === 'untracked'
              ? {}
              : {
                  before: readMemoryMarkdown(
                    root,
                    relative,
                    kind === 'unstaged' ? 'index' : comparisonHead,
                    run,
                  ),
                }),
            ...(change.status === 'D'
              ? {}
              : {
                  after: readMemoryMarkdown(
                    root,
                    relative,
                    kind === 'staged' ? 'index' : 'worktree',
                    run,
                  ),
                }),
          }
        : undefined;
      if (isMemoryImagePath(relative)) {
        const oldSource = kind === 'unstaged' ? 'index' : head(root);
        const newSource = kind === 'staged' ? 'index' : 'worktree';
        return {
          ...change,
          diff: '',
          binary: true,
          images: {
            ...(change.status === 'A' || kind === 'untracked'
              ? {}
              : { before: readMemoryImage(root, relative, oldSource, run).image }),
            ...(change.status === 'D'
              ? {}
              : { after: readMemoryImage(root, relative, newSource, run).image }),
          },
        };
      }
      if (kind !== 'untracked' && !(kind === 'current' && phases[0]?.kind === 'untracked')) {
        const diff = output(root, [
          'diff',
          '--no-ext-diff',
          '--no-textconv',
          '--no-renames',
          ...(kind === 'staged'
            ? ['--cached', comparisonHead]
            : kind === 'current'
              ? [comparisonHead]
              : []),
          '--',
          relative,
        ]);
        if (markdown !== undefined) {
          if (
            head(root) !== comparisonHead ||
            Object.values(markdown).some((document) => {
              const next = readMemoryMarkdown(root, relative, document.source, run);
              return next.revision !== document.revision || next.status !== document.status;
            })
          )
            throw new MemoryImageError('memory-image-stale', 'Markdown changed; refresh the view');
        }
        return {
          ...change,
          diff,
          binary: /^Binary files .+ differ$/mu.test(diff),
          ...(markdown === undefined ? {} : { markdown }),
        };
      }
      const target = resolveMemoryPath(root, relative);
      const stat = lstatSync(target);
      if (stat.isSymbolicLink() || !stat.isFile()) return { ...change, diff: '', binary: true };
      if (stat.size > MAX_FILE_BYTES) {
        throw new MemoryAcceptError('memory-invalid', 'Memory file is too large to preview');
      }
      const bytes = readFileSync(target);
      if (bytes.includes(0)) return { ...change, diff: '', binary: true };
      let body: string;
      try {
        body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        return { ...change, diff: '', binary: true };
      }
      const lines = body === '' ? [] : body.replace(/\n$/u, '').split('\n');
      const diff = [
        `diff --git a/${relative} b/${relative}`,
        'new file mode 100644',
        '--- /dev/null',
        `+++ b/${relative}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((line) => `+${line}`),
        ...(body !== '' && !body.endsWith('\n') ? ['\\ No newline at end of file'] : []),
      ].join('\n');
      return { ...change, diff, binary: false, ...(markdown === undefined ? {} : { markdown }) };
    },
  };
}
