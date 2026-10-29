Pod::Spec.new do |s|
  s.name = 'StreamSurface'
  s.version = '1.0.0'
  s.summary = 'Coherent native clipping for streaming chat surfaces.'
  s.description = s.summary
  s.license = 'MIT'
  s.author = 'BotHarness'
  s.homepage = 'https://github.com/BotHarness/DeepSeekBot'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { git: 'https://github.com/BotHarness/DeepSeekBot.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.test_spec 'Tests' do |tests|
    tests.source_files = 'Tests/**/*.swift'
    tests.requires_app_host = true
    tests.libraries = 'c++'
  end
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
end
