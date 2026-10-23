Pod::Spec.new do |s|
  s.name           = 'LocalComputerVideo'
  s.version        = '1.0.0'
  s.summary        = 'Native receive-only WebRTC video.'
  s.description    = 'Native receive-only WebRTC video.'
  s.license        = 'MIT'
  s.author         = 'BotHarness'
  s.homepage       = 'https://github.com/BotHarness/DeepSeekBot'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/BotHarness/DeepSeekBot.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'WebRTC-SDK', '= 144.7559.15'

  s.source_files = '**/*.{h,m,swift}'
  s.resource_bundles = { 'LocalComputerVideoLicenses' => ['licenses/*'] }
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
