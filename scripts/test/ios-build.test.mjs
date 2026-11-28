import { describe, expect, it } from 'vitest';
import { cacheCounts, casInUse, parseArgs, productsFolder, xcodebuildArgs } from '../ios-build.mjs';

describe('iOS build with the shared compilation cache', () => {
  it('reads its flags and passes settings after --', () => {
    expect(parseArgs([])).toEqual({
      configuration: 'Debug',
      destination: 'generic/platform=iOS Simulator',
      prebuild: false,
      keepDerivedData: false,
      cache: true,
      help: false,
      extra: [],
    });
    expect(
      parseArgs([
        '--configuration',
        'Release',
        '--destination',
        'id=PHONE',
        '--no-cache',
        '--',
        'DEVELOPMENT_TEAM=T',
        '-allowProvisioningUpdates',
      ]),
    ).toMatchObject({
      configuration: 'Release',
      destination: 'id=PHONE',
      cache: false,
      extra: ['DEVELOPMENT_TEAM=T', '-allowProvisioningUpdates'],
    });
    expect(() => parseArgs(['--configuration', 'Profile'])).toThrow('Debug or Release');
    expect(() => parseArgs(['--destination'])).toThrow('--destination needs a value');
    expect(() => parseArgs(['--fast'])).toThrow('unknown flag --fast');
  });

  it('maps the worktree root so cache keys do not depend on the checkout path', () => {
    const args = xcodebuildArgs({
      workspace: '/w/a/apps/mobile/ios/App.xcworkspace',
      scheme: 'App',
      derivedData: '/w/a/apps/mobile/ios/build/DerivedData',
      configuration: 'Debug',
      destination: 'generic/platform=iOS Simulator',
      worktree: '/w/a',
      cas: '/cas',
    });
    expect(args).toEqual(
      expect.arrayContaining([
        '-derivedDataPath',
        '/w/a/apps/mobile/ios/build/DerivedData',
        'COMPILATION_CACHE_ENABLE_CACHING=YES',
        'COMPILATION_CACHE_CAS_PATH=/cas',
        'SWIFT_ENABLE_PREFIX_MAPPING=YES',
        'CLANG_ENABLE_PROJECT_PREFIX_MAPPING=YES',
        'SWIFT_OTHER_PREFIX_MAPPINGS=/w/a=/^wt',
        'CLANG_OTHER_PREFIX_MAPPINGS=/w/a=/^wt',
      ]),
    );
  });

  it('ad-hoc signs Simulator builds and lets later xcodebuild settings override the defaults', () => {
    const args = xcodebuildArgs({
      workspace: 'App.xcworkspace',
      scheme: 'App',
      derivedData: 'dd',
      configuration: 'Debug',
      destination: 'generic/platform=iOS Simulator',
      worktree: '/w/a',
      extra: ['CODE_SIGNING_ALLOWED=NO'],
    });
    expect(args.slice(-3)).toEqual([
      'CODE_SIGNING_ALLOWED=YES',
      'CODE_SIGN_IDENTITY=-',
      'CODE_SIGNING_ALLOWED=NO',
    ]);
  });

  it('keeps signing for device builds and drops cache settings with --no-cache', () => {
    const args = xcodebuildArgs({
      workspace: 'App.xcworkspace',
      scheme: 'App',
      derivedData: 'dd',
      configuration: 'Release',
      destination: 'id=PHONE',
      worktree: '/w/a',
      cas: undefined,
      extra: ['DEVELOPMENT_TEAM=T'],
    });
    expect(args.some((arg) => arg.startsWith('CODE_SIGN'))).toBe(false);
    expect(args.some((arg) => arg.startsWith('COMPILATION_CACHE'))).toBe(false);
    expect(args.at(-1)).toBe('DEVELOPMENT_TEAM=T');
    expect(productsFolder('Release', 'id=PHONE')).toBe('Release-iphoneos');
    expect(productsFolder('Debug', 'generic/platform=iOS Simulator')).toBe('Debug-iphonesimulator');
  });

  it('counts cache hits and misses from Xcode diagnostic remarks', () => {
    const log = [
      'note: replayed cache hit: llvmcas://abc',
      'Cache hit',
      'note: cache miss: llvmcas://def',
      'Cache miss',
      'Cache hit',
    ].join('\n');
    expect(cacheCounts(log)).toEqual({ hits: 2, misses: 1 });
  });

  it('sees when another xcodebuild is using the cache', () => {
    const ps = 'zsh\n/usr/bin/xcodebuild build COMPILATION_CACHE_CAS_PATH=/cas\n';
    expect(casInUse(ps, '/cas')).toBe(true);
    expect(casInUse('zsh\nnode /cas/other', '/cas')).toBe(false);
  });
});
