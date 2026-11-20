import type { PersonaBotRegistry } from '../bots/registry.js';
import { MemoryAcceptError } from './accepted-contract.js';
import type { MemoryVersionName, MemoryVersion, MemoryAcceptance } from './accepted-contract.js';
import { output, run, repository } from './accepted-git.js';

export function versionNames(root: string): Map<string, MemoryVersionName[]> {
  const names = new Map<string, MemoryVersionName[]>();
  for (const line of output(root, [
    'for-each-ref',
    '--format=%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end)%1f%(objecttype)%1f%(refname:strip=2)%1f%(contents:subject)',
    'refs/tags',
  ]).split('\n')) {
    const [sha = '', type = '', tag = '', subject = ''] = line.split('\x1f');
    if (!/^[0-9a-f]{40}$/u.test(sha) || tag === '') continue;
    const name = type === 'tag' && subject !== '' ? subject : tag;
    names.set(sha, [...(names.get(sha) ?? []), { tag, name }]);
  }
  return names;
}

function versionList(root: string): MemoryVersion[] {
  const versions: MemoryVersion[] = [];
  for (const line of output(root, [
    'for-each-ref',
    '--sort=-creatordate',
    '--count=500',
    '--format=%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end)%1f%(if)%(*objecttype)%(then)%(*objecttype)%(else)%(objecttype)%(end)%1f%(objecttype)%1f%(refname:strip=2)%1f%(contents:subject)%1f%(if)%(*objectname)%(then)%(*subject)%(else)%(subject)%(end)%1f%(creatordate:iso-strict)',
    'refs/tags',
  ]).split('\n')) {
    const [sha = '', target = '', type = '', tag = '', message = '', subject = '', namedAt = ''] =
      line.split('\x1f');
    if (!/^[0-9a-f]{40}$/u.test(sha) || target !== 'commit' || tag === '') continue;
    versions.push({
      sha,
      tag,
      name: type === 'tag' && message !== '' ? message : tag,
      subject,
      namedAt,
    });
  }
  return versions;
}

export function validVersionName(name: string): string {
  const label = name.trim();
  if (label === '' || label.length > 60 || /[\u0000-\u001f\u007f]/u.test(label))
    throw new MemoryAcceptError(
      'memory-invalid',
      'Version name must be one line of 1 to 60 characters',
    );
  return label;
}

export function nameVersion(root: string, sha: string, name: string): MemoryVersionName {
  const label = validVersionName(name);
  let commit: string;
  try {
    commit = output(root, ['rev-parse', '--verify', `${sha}^{commit}`]);
  } catch {
    throw new MemoryAcceptError('memory-invalid', 'Memory commit is not in this repository');
  }
  const exists = (tag: string): boolean => {
    try {
      run(root, ['show-ref', '--verify', '--quiet', `refs/tags/${tag}`]);
      return true;
    } catch {
      return false;
    }
  };
  let base = label.replace(/\s+/gu, '-');
  try {
    run(root, ['check-ref-format', `refs/tags/${base}`]);
  } catch {
    base = `version-${commit.slice(0, 7)}`;
  }
  let tag = base;
  for (let suffix = 2; exists(tag); suffix += 1) tag = `${base}-${suffix}`;
  run(root, ['tag', '-a', tag, '-m', label, commit]);
  return { tag, name: label };
}

export function createAcceptedVersions({
  assertIdle,
  graphRepository,
  registry,
}: {
  assertIdle: (botSlug: string) => void;
  graphRepository: (botSlug: string) => string;
  registry: PersonaBotRegistry;
}): Pick<MemoryAcceptance, 'versions' | 'nameVersionHuman' | 'removeVersionNameHuman'> {
  return {
    versions(botSlug) {
      assertIdle(botSlug);
      return versionList(graphRepository(botSlug));
    },
    nameVersionHuman(input) {
      assertIdle(input.botSlug);
      return nameVersion(repository(registry, input.botSlug), input.sha, input.name);
    },
    removeVersionNameHuman(input) {
      assertIdle(input.botSlug);
      const root = repository(registry, input.botSlug);
      try {
        run(root, ['show-ref', '--verify', '--quiet', `refs/tags/${input.tag}`]);
      } catch {
        throw new MemoryAcceptError('memory-invalid', 'Version name is not in this repository');
      }
      run(root, ['tag', '-d', input.tag]);
    },
  };
}
