Pod::Spec.new do |s|
  s.name = 'LanChannel'
  s.version = '0.1.0'
  s.summary = 'Restricted encrypted LAN WebSocket carrier'
  s.description = 'Carries Noise frames to private IPv4 device gateways.'
  s.author = 'BotHarness'
  s.homepage = 'https://github.com/BotHarness/DeepSeekBot'
  s.license = { :type => 'MIT' }
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
