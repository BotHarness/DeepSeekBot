package expo.modules.localcomputervideo

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.util.Size
import android.view.Surface
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.util.Collections
import java.util.WeakHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

internal class CallCameraFailure private constructor(val code: String) : Exception(code) {
  companion object {
    val denied = CallCameraFailure("camera-denied")
    val missing = CallCameraFailure("camera-missing")
    val cancelled = CallCameraFailure("camera-cancelled")
  }
}

/**
 * The phone camera during a Bot call. CameraX at 720p sends JS a grey thumbnail twice a
 * second for the shared keyframe picker and a JPEG of the newest frame only when JS asks
 * for a keyframe. Test builds can play a video file in real time instead of the camera.
 *
 * CameraX owns the capture thread; every public entry point and the preview views live on
 * the main thread. Nothing is written to disk.
 */
internal object CallCamera {
  private sealed class Frame {
    abstract val width: Int
    abstract val height: Int
  }

  private class YuvFrame(
    val nv21: ByteArray,
    override val width: Int,
    override val height: Int,
  ) : Frame()

  private class BitmapFrame(val bitmap: Bitmap) : Frame() {
    override val width: Int get() = bitmap.width
    override val height: Int get() = bitmap.height
  }

  private class TestVideo(
    val reader: MediaMetadataRetriever,
    val first: Bitmap,
    val durationMs: Long,
  )

  private val main = Handler(Looper.getMainLooper())
  private val analysisExecutor = Executors.newSingleThreadExecutor { job ->
    Thread(job, "CallCameraAnalysis").apply { isDaemon = true }
  }
  private val testExecutor = Executors.newSingleThreadScheduledExecutor { job ->
    Thread(job, "CallCameraTest").apply { isDaemon = true }
  }
  private val views = Collections.synchronizedSet(
    Collections.newSetFromMap(WeakHashMap<CallCameraView, Boolean>()),
  )

  var onThumb: ((Map<String, Any>) -> Unit)? = null
  var onState: ((String) -> Unit)? = null

  /**
   * A system camera-permission dialog pauses the activity. Android calls are foreground
   * only (ADR-0284), so the call owner must not treat that one pause as leaving the app.
   * #3423 replaces this bridge when calls keep running in the background.
   */
  @Volatile var askingPermission = false

  private var generation = 0
  private var pendingStart: ((Result<Map<String, Any>>) -> Unit)? = null
  @Volatile private var running = false
  @Volatile private var paused = false
  @Volatile private var testing = false
  private var position = "front"
  private var thumbWidth = 64
  private var intervalMs = 500L
  private var startedAt = 0L
  @Volatile private var lastThumbAt = 0L
  @Volatile private var lastCopyAt = 0L
  @Volatile private var latest: Frame? = null

  private var provider: ProcessCameraProvider? = null
  private var analysis: ImageAnalysis? = null
  private var preview: Preview? = null
  private var lifecycleOwner: CameraLifecycleOwner? = null
  private var testTimer: ScheduledFuture<*>? = null
  @Volatile private var retriever: MediaMetadataRetriever? = null
  @Volatile private var testDurationMs = 0L

  fun hasPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
      PackageManager.PERMISSION_GRANTED

  fun start(
    context: Context,
    position: String,
    testVideo: String?,
    thumbWidth: Int,
    sampleFps: Double,
    done: (Result<Map<String, Any>>) -> Unit,
  ) {
    postToMain {
      cancelStart()
      releaseResources()
      generation += 1
      val current = generation
      pendingStart = done
      this.position = if (position == "back") "back" else "front"
      this.thumbWidth = thumbWidth.coerceIn(16, 256)
      intervalMs = (1000.0 / sampleFps.coerceIn(0.5, 10.0)).toLong().coerceAtLeast(100)
      startedAt = SystemClock.elapsedRealtime()
      running = true
      paused = false
      testing = false
      latest = null
      lastThumbAt = 0
      lastCopyAt = 0
      if (testVideo != null) {
        val path = pathOf(testVideo)
        testExecutor.execute {
          val opened = openTestVideo(path)
          postToMain {
            if (current != generation) {
              opened?.let { video ->
                testExecutor.execute { runCatching { video.reader.release() } }
              }
              return@postToMain
            }
            if (opened == null) {
              finishFailure(current, CallCameraFailure.missing)
              return@postToMain
            }
            retriever = opened.reader
            testDurationMs = opened.durationMs
            latest = BitmapFrame(opened.first)
            testing = true
            runTestTimer(current)
            refreshViews()
            settleStart(current, Result.success(mapOf("position" to "test")))
          }
        }
        return@postToMain
      }
      openCamera(context, current)
    }
  }

  fun keyframe(maxBytes: Int, done: (Map<String, Any>?) -> Unit) {
    analysisExecutor.execute {
      val began = SystemClock.elapsedRealtime()
      val result = when (val frame = latest) {
        is YuvFrame -> yuvJpeg(frame, maxBytes, began)
        is BitmapFrame -> bitmapJpeg(frame.bitmap, maxBytes, began)
        null -> null
      }
      postToMain { done(result) }
    }
  }

  fun pause() {
    postToMain {
      if (!running || paused) return@postToMain
      paused = true
      if (!testing) lifecycleOwner?.pause()
      onState?.invoke("paused")
    }
  }

  fun resume() {
    postToMain {
      if (!running || !paused) return@postToMain
      paused = false
      lastThumbAt = 0
      lastCopyAt = 0
      if (!testing) lifecycleOwner?.resume()
      onState?.invoke("resumed")
    }
  }

  fun stop() {
    postToMain {
      cancelStart()
      generation += 1
      releaseResources()
    }
  }

  fun dispose() {
    postToMain {
      cancelStart()
      generation += 1
      askingPermission = false
      releaseResources()
      onThumb = null
      onState = null
    }
  }

  fun attach(view: CallCameraView) {
    postToMain {
      views.add(view)
      if (testing) {
        (latest as? BitmapFrame)?.let { view.showImage(it.bitmap) } ?: view.showNone()
      } else {
        preview?.let { view.showSession(it) } ?: view.showNone()
      }
    }
  }

  fun detach(view: CallCameraView) {
    views.remove(view)
  }

  private fun openCamera(
    context: Context,
    current: Int,
  ) {
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (current != generation || !running) return@addListener
      val provider = runCatching { future.get() }.getOrNull()
      if (provider == null) {
        finishFailure(current, CallCameraFailure.missing)
        return@addListener
      }
      val selector =
        if (position == "back") CameraSelector.DEFAULT_BACK_CAMERA
        else CameraSelector.DEFAULT_FRONT_CAMERA
      if (!runCatching { provider.hasCamera(selector) }.getOrDefault(false)) {
        finishFailure(current, CallCameraFailure.missing)
        return@addListener
      }
      val owner = CameraLifecycleOwner()
      val preview = Preview.Builder().setTargetRotation(Surface.ROTATION_0).build()
      val analysis = ImageAnalysis.Builder()
        .setResolutionSelector(
          ResolutionSelector.Builder()
            .setResolutionStrategy(
              ResolutionStrategy(
                Size(1280, 720),
                ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
              ),
            )
            .build(),
        )
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
        .setOutputImageRotationEnabled(true)
        .setTargetRotation(Surface.ROTATION_0)
        .build()
      analysis.setAnalyzer(analysisExecutor) { proxy -> analyze(proxy, current) }
      try {
        provider.bindToLifecycle(owner, selector, preview, analysis)
      } catch (_: Exception) {
        analysis.clearAnalyzer()
        owner.destroy()
        finishFailure(current, CallCameraFailure.missing)
        return@addListener
      }
      this.provider = provider
      this.analysis = analysis
      this.preview = preview
      lifecycleOwner = owner
      refreshViews()
      settleStart(current, Result.success(mapOf("position" to this.position)))
    }, ContextCompat.getMainExecutor(context))
  }

  private fun analyze(proxy: ImageProxy, current: Int) {
    try {
      if (current != generation || !running || testing) return
      val now = SystemClock.elapsedRealtime()
      if (now - lastCopyAt >= 90) {
        val copied = runCatching { copyYuv(proxy) }.getOrNull()
        if (copied != null) {
          latest = copied
          lastCopyAt = now
        }
      }
      if (paused || now - lastThumbAt < intervalMs) return
      val frame = latest as? YuvFrame ?: return
      lastThumbAt = now
      val grey = CallCameraFrames.grey(
        frame.nv21,
        frame.width,
        frame.height,
        frame.width,
        1,
        thumbWidth,
      )
      emitThumb(grey, now, current)
    } finally {
      proxy.close()
    }
  }

  private fun copyYuv(proxy: ImageProxy): YuvFrame {
    val yPlane = proxy.planes[0]
    val uPlane = proxy.planes[1]
    val vPlane = proxy.planes[2]
    val nv21 = CallCameraFrames.nv21(
      bytesOf(yPlane.buffer),
      bytesOf(uPlane.buffer),
      bytesOf(vPlane.buffer),
      proxy.width,
      proxy.height,
      yPlane.rowStride,
      yPlane.pixelStride,
      uPlane.rowStride,
      uPlane.pixelStride,
      vPlane.rowStride,
      vPlane.pixelStride,
    )
    return YuvFrame(nv21, proxy.width, proxy.height)
  }

  private fun bytesOf(buffer: ByteBuffer): ByteArray {
    val copy = buffer.duplicate()
    val data = ByteArray(copy.remaining())
    copy.get(data)
    return data
  }

  private fun emitThumb(grey: CallCameraFrames.Grey, now: Long, current: Int) {
    val body = mapOf(
      "grey" to Base64.encodeToString(grey.bytes, Base64.NO_WRAP),
      "width" to grey.width,
      "height" to grey.height,
      "atMs" to (now - startedAt).coerceAtLeast(0).toInt(),
    )
    postToMain { if (current == generation) onThumb?.invoke(body) }
  }

  /** The newest frame at most 1280 pixels on its long edge, as a JPEG no larger than [maxBytes]. */
  private fun yuvJpeg(frame: YuvFrame, maxBytes: Int, began: Long): Map<String, Any>? {
    val (width, height) = CallCameraFrames.scaledSize(frame.width, frame.height, 1280)
    if (width == frame.width && height == frame.height) {
      val data = compressYuv(frame, maxBytes) ?: return null
      return body(data, width, height, began)
    }
    val full = compressYuv(frame, Int.MAX_VALUE) ?: return null
    val bitmap = BitmapFactory.decodeByteArray(full, 0, full.size) ?: return null
    val scaled = Bitmap.createScaledBitmap(bitmap, width, height, true)
    if (scaled !== bitmap) bitmap.recycle()
    return bitmapJpeg(scaled, maxBytes, began, recycle = true)
  }

  private fun compressYuv(frame: YuvFrame, maxBytes: Int): ByteArray? =
    CallCameraFrames.boundedJpeg(maxBytes) { quality ->
      val out = ByteArrayOutputStream()
      val image = YuvImage(frame.nv21, ImageFormat.NV21, frame.width, frame.height, null)
      if (image.compressToJpeg(Rect(0, 0, frame.width, frame.height), quality, out)) {
        out.toByteArray()
      } else {
        null
      }
    }

  private fun bitmapJpeg(
    bitmap: Bitmap,
    maxBytes: Int,
    began: Long,
    recycle: Boolean = false,
  ): Map<String, Any>? {
    val (width, height) = CallCameraFrames.scaledSize(bitmap.width, bitmap.height, 1280)
    val scaled =
      if (width == bitmap.width && height == bitmap.height) bitmap
      else Bitmap.createScaledBitmap(bitmap, width, height, true)
    try {
      val data = compressBitmap(scaled, maxBytes) ?: return null
      return body(data, scaled.width, scaled.height, began)
    } finally {
      if (scaled !== bitmap) scaled.recycle()
      if (recycle) bitmap.recycle()
    }
  }

  private fun compressBitmap(bitmap: Bitmap, maxBytes: Int): ByteArray? =
    CallCameraFrames.boundedJpeg(maxBytes) { quality ->
      val out = ByteArrayOutputStream()
      if (bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)) out.toByteArray() else null
    }

  private fun body(data: ByteArray, width: Int, height: Int, began: Long): Map<String, Any> =
    mapOf(
      "jpeg" to Base64.encodeToString(data, Base64.NO_WRAP),
      "bytes" to data.size,
      "width" to width,
      "height" to height,
      "prepareMs" to (SystemClock.elapsedRealtime() - began).toInt(),
    )

  private fun openTestVideo(path: String): TestVideo? {
    val file = File(path)
    if (!file.isFile) return null
    val reader = MediaMetadataRetriever()
    return try {
      reader.setDataSource(file.absolutePath)
      val duration =
        reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
          ?.toLongOrNull()
          ?.coerceAtLeast(1) ?: 1L
      val first = reader.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
      if (first == null) {
        reader.release()
        null
      } else {
        TestVideo(reader, first, duration)
      }
    } catch (_: Exception) {
      runCatching { reader.release() }
      null
    }
  }

  /** Plays the test video at its own pace and keeps showing the last frame once it ends. */
  private fun runTestTimer(current: Int) {
    val began = startedAt
    val duration = testDurationMs.coerceAtLeast(1)
    var lastPreviewAt = 0L
    testTimer = testExecutor.scheduleAtFixedRate({
      if (current != generation || !running || !testing) return@scheduleAtFixedRate
      val now = SystemClock.elapsedRealtime()
      val elapsed = (now - began).coerceAtLeast(0)
      val at = elapsed.coerceAtMost(duration - 1) * 1000
      val bitmap =
        runCatching {
          retriever?.getFrameAtTime(at, MediaMetadataRetriever.OPTION_CLOSEST)
        }.getOrNull() ?: return@scheduleAtFixedRate
      latest = BitmapFrame(bitmap)
      if (paused) return@scheduleAtFixedRate
      if (now - lastPreviewAt >= 100) {
        lastPreviewAt = now
        postToMain {
          if (current == generation) views.toList().forEach { it.showImage(bitmap) }
        }
      }
      if (now - lastThumbAt >= intervalMs) {
        lastThumbAt = now
        emitThumb(greyFromBitmap(bitmap, thumbWidth), now, current)
      }
    }, 0, 100, TimeUnit.MILLISECONDS)
  }

  private fun greyFromBitmap(bitmap: Bitmap, targetWidth: Int): CallCameraFrames.Grey {
    val (width, height) = CallCameraFrames.thumbnailSize(bitmap.width, bitmap.height, targetWidth)
    val scaled =
      if (width == bitmap.width && height == bitmap.height) bitmap
      else Bitmap.createScaledBitmap(bitmap, width, height, true)
    try {
      val pixels = IntArray(width * height)
      scaled.getPixels(pixels, 0, width, 0, 0, width, height)
      val bytes = ByteArray(pixels.size)
      for (index in pixels.indices) {
        val color = pixels[index]
        val red = (color shr 16) and 0xff
        val green = (color shr 8) and 0xff
        val blue = color and 0xff
        bytes[index] = ((red * 299 + green * 587 + blue * 114) / 1000).toByte()
      }
      return CallCameraFrames.Grey(bytes, width, height)
    } finally {
      if (scaled !== bitmap) scaled.recycle()
    }
  }

  private fun refreshViews() {
    val active = if (running && !testing) preview else null
    for (view in views.toList()) {
      if (testing) {
        (latest as? BitmapFrame)?.let { view.showImage(it.bitmap) } ?: view.showNone()
      } else {
        active?.let { view.showSession(it) } ?: view.showNone()
      }
    }
  }

  private fun finishFailure(current: Int, failure: CallCameraFailure) {
    if (current != generation) return
    settleStart(current, Result.failure(failure))
    releaseResources()
  }

  private fun settleStart(current: Int, result: Result<Map<String, Any>>) {
    if (current != generation) return
    val done = pendingStart ?: return
    pendingStart = null
    done(result)
  }

  private fun cancelStart() {
    val done = pendingStart ?: return
    pendingStart = null
    done(Result.failure(CallCameraFailure.cancelled))
  }

  private fun releaseResources() {
    running = false
    paused = false
    testing = false
    latest = null
    testTimer?.cancel(false)
    testTimer = null
    releaseTestVideo()
    analysis?.clearAnalyzer()
    val provider = this.provider
    val preview = this.preview
    val analysis = this.analysis
    this.provider = null
    this.preview = null
    this.analysis = null
    if (provider != null) {
      runCatching {
        when {
          preview != null && analysis != null -> provider.unbind(preview, analysis)
          preview != null -> provider.unbind(preview)
          analysis != null -> provider.unbind(analysis)
        }
      }
    }
    lifecycleOwner?.destroy()
    lifecycleOwner = null
    views.toList().forEach { it.showNone() }
  }

  private fun releaseTestVideo() {
    val reader = retriever ?: return
    retriever = null
    testExecutor.execute { runCatching { reader.release() } }
  }

  private fun pathOf(value: String): String =
    if (value.startsWith("file://")) Uri.parse(value).path ?: value else value

  private inline fun postToMain(crossinline action: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) action() else main.post { action() }
  }

  private class CameraLifecycleOwner : LifecycleOwner {
    private val registry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = registry

    init {
      registry.currentState = Lifecycle.State.RESUMED
    }

    fun pause() {
      registry.currentState = Lifecycle.State.CREATED
    }

    fun resume() {
      registry.currentState = Lifecycle.State.RESUMED
    }

    fun destroy() {
      registry.currentState = Lifecycle.State.DESTROYED
    }
  }
}
