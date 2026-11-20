package expo.modules.conversationnotifications

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject

internal data class RecoveryGroup(
  val host: String,
  val batch: String,
  val title: String,
  val language: String,
  val presented: String?,
  val surface: String?,
  val members: List<JSONObject>
) {
  val id get() = "recovery:$batch"
  val signature get() = JSONArray(members.map { it.getString("itemId") }.sorted()).toString()
  fun alert(): JSONObject {
    val replies = members.count { it.optString("kind") in setOf("channel-reply", "channel-mention") }
    val requests = members.size - replies
    val text = if (language == "zh") "新回复 $replies · 待处理 $requests" else "New replies $replies · Needs you $requests"
    return JSONObject().put("title", title).put("body", text)
      .put("members", JSONArray(members.map { it.getString("itemId") }))
      .put("data", JSONObject().put("v", 1).put("hostId", host).put("itemId", id)
        .put("kind", "recovery-summary").put("botSlug", "").put("channelId", "")
        .put("messageId", "").put("sender", title).put("text", text))
  }
}

internal class RecoveryGroups(private val db: SQLiteDatabase) {
  fun stage(host: String, metadata: JSONObject, candidates: List<JSONObject>) {
    if (candidates.isEmpty()) return
    val batch = metadata.getString("batch")
    val members = candidates.map { data ->
      JSONObject().put("itemId", data.getString("itemId")).put("kind", data.getString("kind"))
        .put("channelId", data.optString("channelId")).put("hostId", host)
    }
    db.insertOrThrow("recovery_groups", null, ContentValues().apply {
      put("host", host); put("batch", batch); put("title", metadata.getString("hostName"))
      put("language", metadata.getString("language")); put("members", JSONArray(members).toString())
    })
    for (member in members) db.execSQL(
      "UPDATE alerts SET state = 'grouped' WHERE host = ? AND item = ? AND state = 'pending'",
      arrayOf(host, member.getString("itemId"))
    )
  }

  fun read(host: String): List<RecoveryGroup> {
    val pending = db.rawQuery("SELECT item FROM alerts WHERE host = ? AND state = 'grouped'", arrayOf(host)).use { rows ->
      buildSet { while (rows.moveToNext()) add(rows.getString(0)) }
    }
    return db.rawQuery("SELECT batch, title, language, presented, members, surface FROM recovery_groups WHERE host = ?", arrayOf(host)).use { rows ->
      buildList {
        while (rows.moveToNext()) {
          val members = JSONArray(rows.getString(4))
          add(RecoveryGroup(host, rows.getString(0), rows.getString(1), rows.getString(2),
            if (rows.isNull(3)) null else rows.getString(3),
            if (rows.isNull(5)) null else rows.getString(5),
            (0 until members.length()).map { members.getJSONObject(it) }.filter { it.getString("itemId") in pending }))
        }
      }
    }
  }

  fun presented(group: RecoveryGroup, surface: String) {
    db.execSQL("UPDATE recovery_groups SET presented = ?, surface = ? WHERE host = ? AND batch = ?",
      arrayOf(group.signature, surface, group.host, group.batch))
  }

  fun forget(host: String) { db.delete("recovery_groups", "host = ?", arrayOf(host)) }

  companion object {
    fun install(db: SQLiteDatabase) {
      db.execSQL("CREATE TABLE recovery_groups (host TEXT NOT NULL, batch TEXT NOT NULL, title TEXT NOT NULL, language TEXT NOT NULL, members TEXT NOT NULL, presented TEXT, surface TEXT, PRIMARY KEY(host, batch))")
    }
  }
}
