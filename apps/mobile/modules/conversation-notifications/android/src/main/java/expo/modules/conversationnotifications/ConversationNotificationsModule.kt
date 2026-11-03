package expo.modules.conversationnotifications

import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import com.caverock.androidsvg.SVG
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import java.io.File
import org.json.JSONObject

class ConversationNotificationsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ConversationNotifications")
    Events("connectionState", "approvalArrived")

    OnCreate {
      ConnectionService.changed = {
        appContext.reactContext?.let { sendEvent("connectionState", ConnectionService.state(it)) }
      }
      ApprovalAlerts.incoming = { host, item ->
        sendEvent("approvalArrived", mapOf("hostId" to host, "itemId" to item))
      }
    }
    OnDestroy { ConnectionService.changed = null; ApprovalAlerts.incoming = null }

    Function("connectionState") {
      ConnectionService.state(requireNotNull(appContext.reactContext))
    }
    Function("setConnectionEnabled") { enabled: Boolean ->
      if (enabled) check(appContext.currentActivity != null) { "foreground-required" }
      ConnectionService.setEnabled(requireNotNull(appContext.reactContext), enabled)
    }
    AsyncFunction("syncAlertHostsAsync") Coroutine { hosts: List<String>, enabled: Boolean, preferences: Map<String, Boolean>, kinds: Map<String, Boolean> ->
      ApprovalAlerts.get(requireNotNull(appContext.reactContext)).hosts(hosts.toSet(), enabled, preferences, kinds)
    }
    AsyncFunction("reconcileAlertsAsync") Coroutine { snapshot: String ->
      ApprovalAlerts.get(requireNotNull(appContext.reactContext)).reconcile(JSONObject(snapshot))
    }
    AsyncFunction("forgetAlertsAsync") Coroutine { host: String ->
      ApprovalAlerts.get(requireNotNull(appContext.reactContext)).forget(host)
    }
    AsyncFunction("verifyAbsentAlertAsync") Coroutine { host: String, item: String ->
      ApprovalAlerts.get(requireNotNull(appContext.reactContext)).verifiedAbsent(host, item)
    }

    AsyncFunction("rasterizeSvgAsync") { svg: String, target: String, size: Int ->
      rasterize(svg, File(Uri.parse(target).path ?: target), size)
    }
  }
}

/**
 * Generated Bot avatars are SVG, which expo-image cannot load into a bitmap on Android, so the
 * avatar cache (src/host/native-notification-avatars.ts) has them drawn into a PNG here.
 */
fun rasterize(svg: String, target: File, size: Int) {
  val document = SVG.getFromString(svg)
  document.documentWidth = size.toFloat()
  document.documentHeight = size.toFloat()
  val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
  try {
    document.renderToCanvas(Canvas(bitmap))
    target.parentFile?.mkdirs()
    val temporary = File(target.parentFile, "${target.name}.tmp")
    temporary.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    if (!temporary.renameTo(target)) {
      temporary.delete()
      error("rasterize-write-failed")
    }
  } finally {
    bitmap.recycle()
  }
}
