package expo.modules.localcomputervideo

import android.content.Context
import android.graphics.Bitmap
import android.widget.ImageView
import androidx.camera.core.Preview
import androidx.camera.view.PreviewView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * The call's self-preview: the live CameraX surface, or the test video's frames. The
 * PreviewView mirrors a front camera by itself; keyframes sent to the Bot are not mirrored.
 */
class CallCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val live = PreviewView(context).apply {
    // A TextureView keeps the preview inside the call screen's rounded clipping.
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }
  private val still = ImageView(context).apply {
    scaleType = ImageView.ScaleType.CENTER_CROP
    visibility = GONE
  }

  init {
    addView(live, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    addView(still, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    CallCamera.attach(this)
  }

  override fun onDetachedFromWindow() {
    CallCamera.detach(this)
    super.onDetachedFromWindow()
  }

  fun showSession(preview: Preview) {
    still.setImageDrawable(null)
    still.visibility = GONE
    preview.setSurfaceProvider(live.surfaceProvider)
    live.visibility = VISIBLE
  }

  fun showImage(bitmap: Bitmap) {
    live.visibility = GONE
    still.setImageBitmap(bitmap)
    still.visibility = VISIBLE
  }

  fun showNone() {
    live.visibility = GONE
    still.setImageDrawable(null)
    still.visibility = GONE
  }
}
