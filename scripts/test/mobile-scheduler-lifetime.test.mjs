import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const require = createRequire(join(root, 'apps/mobile/package.json'));
const nativeRoot = resolve(require.resolve('react-native/package.json'), '..');
const schedulerRoot = join(nativeRoot, 'ReactCommon/react/renderer/scheduler');
const source = readFileSync(join(schedulerRoot, 'Scheduler.cpp'), 'utf8');
const header = readFileSync(join(schedulerRoot, 'Scheduler.h'), 'utf8');
const delegateHeader = readFileSync(join(schedulerRoot, 'SchedulerDelegate.h'), 'utf8');
const retainedCallback = delegateHeader.match(
  /virtual std::shared_ptr<SchedulerDelegate> retainForDeferredCallback\(\)\s*\{\s*return \{\};\s*\}/u,
)?.[0];
assert.ok(retainedCallback, 'Missing delegate ownership contract');

function method(name) {
  const start = source.indexOf(`void Scheduler::${name}(`);
  assert.notEqual(start, -1, `Missing real Scheduler method ${name}`);
  const open = source.indexOf('{', start);
  let depth = 1;
  let end = open + 1;
  for (; end < source.length && depth > 0; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  assert.equal(depth, 0);
  return source.slice(start, end);
}

const fixture = `
#include <atomic>
#include <cassert>
#include <functional>
#include <memory>
#include <string>
#include <utility>
#include <vector>
namespace folly { struct dynamic {}; }
struct TraceSection { template<class... T> TraceSection(T&&...) {} };
struct MountingCoordinator { int getSurfaceId() const { return 1; } };
struct ShadowNode { int getSurfaceId() const { return 1; } };
struct ShadowView { explicit ShadowView(const ShadowNode&) {} };
struct SchedulerDelegate {
  virtual ~SchedulerDelegate() = default;
  ${retainedCallback}
  virtual void schedulerDidFinishTransaction(std::shared_ptr<const MountingCoordinator>) = 0;
  virtual void schedulerShouldRenderTransactions(std::shared_ptr<const MountingCoordinator>) = 0;
  virtual void schedulerDidDispatchCommand(const ShadowView&, const std::string&, const folly::dynamic&) = 0;
};
struct RecordingDelegate : SchedulerDelegate {
  int& calls;
  explicit RecordingDelegate(int& value) : calls(value) {}
  void schedulerDidFinishTransaction(std::shared_ptr<const MountingCoordinator>) override {}
  void schedulerShouldRenderTransactions(std::shared_ptr<const MountingCoordinator>) override { calls++; }
  void schedulerDidDispatchCommand(const ShadowView&, const std::string&, const folly::dynamic&) override { calls++; }
};
struct RetainedDelegate final : RecordingDelegate, std::enable_shared_from_this<RetainedDelegate> {
  std::function<void()> duringDispatch;
  explicit RetainedDelegate(int& value) : RecordingDelegate(value) {}
  std::shared_ptr<SchedulerDelegate> retainForDeferredCallback() override { return shared_from_this(); }
  void schedulerDidDispatchCommand(const ShadowView&, const std::string&, const folly::dynamic&) override {
    if (duringDispatch) duringDispatch();
    calls++;
  }
};
struct RuntimeScheduler {
  std::vector<std::function<void()>> pending;
  void scheduleRenderingUpdate(int, std::function<void()> callback) { pending.push_back(std::move(callback)); }
  void drain() { auto callbacks = std::move(pending); pending.clear(); for(auto& callback : callbacks) callback(); }
};
struct Scheduler {
  SchedulerDelegate* delegate_;
  RuntimeScheduler* runtimeScheduler_;
  ${header.match(/std::shared_ptr<std::atomic<bool>>\s+delegateInvalidated_[^;]*;/u)?.[0] ?? ''}
  Scheduler(SchedulerDelegate* delegate, RuntimeScheduler* runtime) : delegate_(delegate), runtimeScheduler_(runtime) {}
  void setDelegate(SchedulerDelegate*);
  void uiManagerDidFinishTransaction(std::shared_ptr<const MountingCoordinator>, bool);
  void uiManagerDidDispatchCommand(const std::shared_ptr<const ShadowNode>&, const std::string&, const folly::dynamic&);
};
${method('setDelegate')}
${method('uiManagerDidFinishTransaction')}
${method('uiManagerDidDispatchCommand')}
int main(int argc, char** argv) {
  assert(argc == 2);
  const std::string scenario(argv[1]);
  RuntimeScheduler runtime;
  int calls = 0, replacementCalls = 0;
  auto delegate = std::make_unique<RecordingDelegate>(calls);
  Scheduler scheduler(delegate.get(), &runtime);
  auto node = std::make_shared<const ShadowNode>();
  if (scenario == "retained" || scenario == "in-flight") {
    auto retained = std::make_shared<RetainedDelegate>(calls);
    std::weak_ptr<RetainedDelegate> lifetime = retained;
    scheduler.setDelegate(retained.get());
    if (scenario == "in-flight") {
      retained->duringDispatch = [&] {
        scheduler.setDelegate(nullptr);
        retained.reset();
        assert(!lifetime.expired());
      };
    }
    scheduler.uiManagerDidDispatchCommand(node, "focus", {});
    if (scenario == "retained") {
      scheduler.setDelegate(nullptr);
      retained.reset();
      assert(!lifetime.expired());
    }
    runtime.drain();
    assert(calls == (scenario == "in-flight" ? 1 : 0));
    assert(lifetime.expired());
    return 0;
  }
  auto queue = [&] {
    if (scenario == "transaction") scheduler.uiManagerDidFinishTransaction(std::make_shared<const MountingCoordinator>(), false);
    else scheduler.uiManagerDidDispatchCommand(node, "focus", {});
  };
  queue();
  if (scenario == "live") {
    scheduler.setDelegate(delegate.get());
    runtime.drain();
    assert(calls == 1);
  } else if (scenario == "replace") {
    auto replacement = std::make_unique<RecordingDelegate>(replacementCalls);
    scheduler.setDelegate(replacement.get());
    delegate.reset();
    queue();
    runtime.drain();
    assert(calls == 0 && replacementCalls == 1);
    scheduler.setDelegate(nullptr);
  } else {
    scheduler.setDelegate(nullptr);
    delegate.reset();
    runtime.drain();
    assert(calls == 0);
  }
}
`;

test('native Scheduler drops stale commands and transactions after delegate teardown', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mobile-scheduler-lifetime-'));
  try {
    const input = join(directory, 'scheduler.cpp');
    const executable = join(directory, 'scheduler');
    writeFileSync(input, fixture);
    const compiler = process.env.CXX || 'c++';
    const build = spawnSync(
      compiler,
      ['-std=c++20', '-fsanitize=address', '-g', '-O1', input, '-o', executable],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(build.status, 0, build.stderr);
    for (const scenario of ['command', 'transaction', 'replace', 'live', 'retained', 'in-flight']) {
      const run = spawnSync(executable, [scenario], {
        encoding: 'utf8',
        env: { ...process.env, ASAN_OPTIONS: 'detect_leaks=0' },
      });
      assert.equal(run.status, 0, `${scenario}: ${run.stderr.slice(0, 6000)}`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 60_000);

test('iOS deferred proxies retain themselves without retaining their Objective-C owner', () => {
  const iosSource = readFileSync(join(nativeRoot, 'React/Fabric/RCTScheduler.mm'), 'utf8');
  const proxy = iosSource.slice(
    iosSource.indexOf('class SchedulerDelegateProxy'),
    iosSource.indexOf('class LayoutAnimationDelegateProxy'),
  );
  assert.match(proxy, /std::enable_shared_from_this<SchedulerDelegateProxy>/u);
  assert.match(
    proxy,
    /retainForDeferredCallback\(\) override\s*\{\s*return shared_from_this\(\);/u,
  );
  assert.match(proxy, /__weak RCTScheduler \*scheduler_;/u);
  assert.doesNotMatch(proxy, /\(__bridge RCTScheduler \*\)scheduler_;/u);
  assert.match(iosSource, /std::shared_ptr<SchedulerDelegateProxy> _delegateProxy;/u);
  assert.match(iosSource, /_delegateProxy = std::make_shared<SchedulerDelegateProxy>/u);
});
