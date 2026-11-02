package expo.modules.materialsearchbar

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// The Chats row avatar: 48dp, a rounded square at radius.md (DESIGN.md, Chats rows).
private val SIZE = 48.dp
private val CORNER = 12.dp

private val bitmaps = LruCache<String, ImageBitmap>(32)

/**
 * A result's avatar as the Chats row draws it: the cached PNG of the Bot or Channel avatar, else
 * its initial (a Bot) or `#` (a Channel) on a muted square. A paused Bot is dimmed.
 */
@Composable
fun ResultAvatar(result: SearchResult) {
  val image by produceState<ImageBitmap?>(null, result.image) {
    value = withContext(Dispatchers.IO) { loadAvatar(result.image) }
  }
  Box(
    modifier = Modifier.size(SIZE)
      .alpha(if (result.dimmed) 0.5f else 1f)
      .clip(RoundedCornerShape(CORNER))
      .background(MaterialTheme.colorScheme.surfaceContainerHighest),
    contentAlignment = Alignment.Center,
  ) {
    val bitmap = image
    if (bitmap != null) {
      Image(bitmap, contentDescription = null, modifier = Modifier.size(SIZE), contentScale = ContentScale.Crop)
    } else {
      Text(
        result.initial,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.titleMedium,
      )
    }
  }
}

/** Decodes the avatar PNG, keyed by its modification time so a re-rendered avatar shows. */
private fun loadAvatar(image: String): ImageBitmap? {
  val file = avatarPath(image)?.let(::File)?.takeIf { it.isFile } ?: return null
  val key = "${file.path}:${file.lastModified()}"
  bitmaps.get(key)?.let { return it }
  val bitmap = runCatching { BitmapFactory.decodeFile(file.path) }.getOrNull() ?: return null
  return bitmap.asImageBitmap().also { bitmaps.put(key, it) }
}
