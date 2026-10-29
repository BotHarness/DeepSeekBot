Pod::Spec.new do |s|
  s.name           = 'NativeMenu'
  s.version        = '1.0.0'
  s.summary        = 'Anchored UIKit action menus with a semantic opening event.'
  s.description    = 'Anchored UIKit action menus with a semantic opening event.'
  s.license        = 'MIT'
  s.author         = 'BotHarness'
  s.homepage       = 'https://github.com/BotHarness/DeepSeekBot'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/BotHarness/DeepSeekBot.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
