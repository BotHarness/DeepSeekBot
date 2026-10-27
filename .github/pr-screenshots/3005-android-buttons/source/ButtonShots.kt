package shots

import android.annotation.SuppressLint
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.google.android.material.color.utilities.Hct
import com.google.android.material.color.utilities.MaterialDynamicColors
import com.google.android.material.color.utilities.SchemeTonalSpot
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@SuppressLint("RestrictedApi")
fun seedScheme(seed: Int, dark: Boolean): ColorScheme {
  val s = SchemeTonalSpot(Hct.fromInt(seed), dark, 0.0)
  val m = MaterialDynamicColors()
  fun c(d: com.google.android.material.color.utilities.DynamicColor) = Color(d.getArgb(s))
  return (if (dark) darkColorScheme() else lightColorScheme()).copy(
    primary = c(m.primary()), onPrimary = c(m.onPrimary()),
    primaryContainer = c(m.primaryContainer()), onPrimaryContainer = c(m.onPrimaryContainer()),
    secondary = c(m.secondary()), onSecondary = c(m.onSecondary()),
    secondaryContainer = c(m.secondaryContainer()), onSecondaryContainer = c(m.onSecondaryContainer()),
    surface = c(m.surface()), onSurface = c(m.onSurface()), background = c(m.background()),
    surfaceContainerLow = c(m.surfaceContainerLow()), onSurfaceVariant = c(m.onSurfaceVariant()),
    error = c(m.error()), onError = c(m.onError()),
  )
}

enum class Kind { Filled, Tonal, Text }

@Composable
fun Shot(label: String, kind: Kind, icon: Int?, busy: Boolean = false, danger: Boolean = false, enabled: Boolean = true) {
  val roles = MaterialTheme.colorScheme
  val content: @Composable RowScope.() -> Unit = {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
      if (busy) CircularProgressIndicator(strokeWidth = 2.5.dp, modifier = Modifier.size(18.dp))
      else if (icon != null) Icon(painterResource(icon), null, Modifier.size(18.dp))
      Text(label)
    }
  }
  val m = Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp)
  val on = enabled && !busy
  when (kind) {
    Kind.Filled -> Button({}, m, enabled = on, colors = if (danger) ButtonDefaults.buttonColors(containerColor = roles.error, contentColor = roles.onError) else ButtonDefaults.buttonColors(), content = content)
    Kind.Tonal -> FilledTonalButton({}, m, enabled = on, content = content)
    Kind.Text -> TextButton({}, m, enabled = on, colors = if (danger) ButtonDefaults.textButtonColors(contentColor = roles.error) else ButtonDefaults.textButtonColors(), content = content)
  }
}

@RunWith(Parameterized::class)
class ButtonShots(private val dark: Boolean, private val scale: Float) {
  companion object {
    @JvmStatic @Parameterized.Parameters(name = "dark={0},scale={1}")
    fun params() = listOf(arrayOf<Any>(false, 1f), arrayOf<Any>(true, 1f), arrayOf<Any>(false, 2f), arrayOf<Any>(true, 2f))
  }

  @get:Rule val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5.copy(fontScale = scale, softButtons = false), showSystemUi = false, maxPercentDifference = 1.0)

  @Test fun buttons() {
    val seed = if (dark) 0xFF7AAAFF.toInt() else 0xFF4176E6.toInt()
    paparazzi.snapshot(name = (if (dark) "dark" else "light") + "-font" + scale.toInt()) {
      MaterialTheme(colorScheme = seedScheme(seed, dark)) {
        Column(
          Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface).padding(16.dp),
          verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
          Text("primary · filled", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
          Shot("Approve", Kind.Filled, R.drawable.ic_check)
          Text("secondary / tonal · filled tonal", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
          Shot("Try again", Kind.Tonal, R.drawable.ic_refresh)
          Shot("Start a new session", Kind.Tonal, R.drawable.ic_plus)
          Text("text", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
          Shot("Paste image", Kind.Text, R.drawable.ic_photo)
          Text("danger · filled / text", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
          Shot("Archive", Kind.Filled, R.drawable.ic_archive, danger = true)
          Shot("Deny", Kind.Text, R.drawable.ic_x, danger = true)
          Text("busy · disabled", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
          Shot("Approve", Kind.Filled, R.drawable.ic_check, busy = true)
          Shot("Create", Kind.Tonal, null, enabled = false)
        }
      }
    }
  }
}
