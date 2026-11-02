import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { productDsh, productImProvider } from '../product-artifacts.mjs';
import { providerRuntimeDigest } from '../dev-im-provider.mjs';
import { verifyPackagedProfile } from '../packaged-profile.mjs';

it('checks Provider provenance against its immutable input pin independently of the composed Host release', () => {
  const root = mkdtempSync(join(tmpdir(), 'zoom-packaged-profile-'));
  const save = (path, value) => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(value));
  };
  try {
    const version = '0.0.0-qa.2270.1';
    const names = [
      'deepseekbot',
      '@botharness/tobs',
      '@botharness/core',
      '@botharness/ui',
      '@botharness/browser',
      '@botharness/computer',
      productImProvider.name,
    ];
    const artifacts = names.map((name, index) => {
      const packageVersion = name === productImProvider.name ? productImProvider.version : version;
      save(join(root, 'profile/node_modules', name, 'package.json'), {
        name,
        version: packageVersion,
      });
      const filename = `${index}.tgz`;
      const bytes = Buffer.from(name);
      writeFileSync(join(root, filename), bytes);
      return {
        name,
        version: packageVersion,
        filename,
        integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
      };
    });
    const provider = join(root, 'profile/node_modules', productImProvider.name);
    for (const path of ['lib/index.js', 'src/index.js', 'plugin-src/index.js', 'cordis.patch.yml'])
      save(join(provider, path), {});
    const runtime = providerRuntimeDigest(provider);
    const provenance = {
      source: productImProvider.upstream.source,
      dsh: productImProvider.upstream.dsh,
      compiledOutput: runtime,
    };
    save(join(provider, 'PROVENANCE.json'), provenance);
    save(join(root, 'artifacts.json'), {
      productVersion: version,
      dsh: productDsh,
      providerRuntime: runtime,
      artifacts,
    });
    expect(verifyPackagedProfile(join(root, 'profile'), root).runtime).toEqual(runtime);
    save(join(provider, 'PROVENANCE.json'), { ...provenance, dsh: 'unknown' });
    expect(() => verifyPackagedProfile(join(root, 'profile'), root)).toThrow(
      'qualified provenance',
    );
    save(join(provider, 'PROVENANCE.json'), provenance);
    save(join(provider, 'lib/index.js'), 'changed');
    expect(() => verifyPackagedProfile(join(root, 'profile'), root)).toThrow(
      'qualified provenance',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
