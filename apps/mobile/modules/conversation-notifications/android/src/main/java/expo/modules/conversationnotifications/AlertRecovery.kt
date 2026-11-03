package expo.modules.conversationnotifications

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase

internal enum class RecoveryMode { INCOMPLETE, DISABLED, INITIAL, RECOVERY, LIVE }

internal class AlertRecovery(private val db: SQLiteDatabase) {
  fun enter(host: String, session: String, ready: Boolean, enabled: Boolean, epoch: Long = 0): RecoveryMode {
    require(host.isNotEmpty() && session.isNotEmpty())
    val previous = db.rawQuery(
      "SELECT initialized, session, ready, epoch FROM recovery_hosts WHERE host = ?", arrayOf(host)
    ).use { rows ->
      if (rows.moveToFirst()) Triple(rows.getInt(0) == 1 && rows.getLong(3) == epoch, rows.getString(1), rows.getInt(2) == 1) else null
    }
    val initialized = enabled && previous?.first == true
    val mode = when {
      !enabled -> RecoveryMode.DISABLED
      !ready -> RecoveryMode.INCOMPLETE
      !initialized -> RecoveryMode.INITIAL
      previous == null || previous.second != session || !previous.third -> RecoveryMode.RECOVERY
      else -> RecoveryMode.LIVE
    }
    db.insertWithOnConflict("recovery_hosts", null, ContentValues().apply {
      put("host", host)
      put("initialized", if (initialized || (enabled && ready)) 1 else 0)
      put("session", session)
      put("epoch", epoch)
      put("ready", if (enabled && ready) 1 else 0)
    }, SQLiteDatabase.CONFLICT_REPLACE)
    return mode
  }

  fun reset(host: String) {
    db.execSQL("UPDATE recovery_hosts SET initialized = 0, ready = 0 WHERE host = ?", arrayOf(host))
  }

  fun forget(host: String) {
    db.delete("recovery_hosts", "host = ?", arrayOf(host))
  }

  fun claimSound(batch: String): Boolean {
    require(batch.isNotEmpty())
    return db.insertWithOnConflict("recovery_sounds", null, ContentValues().apply {
      put("batch", batch)
    }, SQLiteDatabase.CONFLICT_IGNORE) != -1L
  }

  companion object {
    fun install(db: SQLiteDatabase) {
      db.execSQL("CREATE TABLE recovery_hosts (host TEXT PRIMARY KEY NOT NULL, initialized INTEGER NOT NULL, session TEXT NOT NULL, ready INTEGER NOT NULL, epoch INTEGER NOT NULL)")
      RecoveryGroups.install(db)
      db.execSQL("CREATE TABLE recovery_sounds (batch TEXT PRIMARY KEY NOT NULL)")
    }
  }
}
