Pod::Spec.new do |s|
  s.name           = 'HardwareSend'
  s.version        = '1.0.0'
  s.summary        = 'Sends the chat draft from a hardware keyboard shortcut.'
  s.description    = 'Sends the chat draft from a hardware keyboard shortcut.'
  s.license        = 'MIT'
  s.author         = 'BotHarness'
  s.homepage       = 'https://github.com/BotHarness/DeepSeekBot'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/BotHarness/DeepSeekBot.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.exclude_files = 'Tests/**/*', 'TestHost/**/*'
  s.test_spec 'Tests' do |tests|
    tests.source_files = 'Tests/**/*.swift'
    tests.requires_app_host = true
    tests.app_host_name = 'HardwareSend/TestHost'
    tests.dependency 'HardwareSend/TestHost'
    tests.libraries = 'c++'
  end
  s.app_spec 'TestHost' do |host|
    host.source_files = 'TestHost/**/*.swift'
    host.libraries = 'c++'
    host.info_plist = {
      'UIApplicationSceneManifest' => {
        'UIApplicationSupportsMultipleScenes' => false,
        'UISceneConfigurations' => {
          'UIWindowSceneSessionRoleApplication' => [
            { 'UISceneConfigurationName' => 'HardwareSend Tests' }
          ]
        }
      }
    }
  end
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
