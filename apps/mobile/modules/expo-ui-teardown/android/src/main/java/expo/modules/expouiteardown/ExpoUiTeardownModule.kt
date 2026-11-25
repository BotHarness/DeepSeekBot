package expo.modules.expouiteardown

import com.facebook.soloader.SoLoader
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoUiTeardownModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoUiTeardown")

    OnCreate {
      SoLoader.loadLibrary("expo-modules-core")
    }
  }
}
