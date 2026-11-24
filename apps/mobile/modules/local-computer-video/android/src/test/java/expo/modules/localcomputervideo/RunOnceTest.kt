package expo.modules.localcomputervideo

import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RunOnceTest {
  @Test
  fun concurrentCallersRunTheActionOnce() {
    val runs = AtomicInteger()
    val once = RunOnce<Unit> {
      runs.incrementAndGet()
      Thread.sleep(20)
    }
    val threads = 8
    val start = CountDownLatch(1)
    val pool = Executors.newFixedThreadPool(threads)
    repeat(threads) {
      pool.execute {
        start.await()
        once.run(Unit)
      }
    }
    start.countDown()
    pool.shutdown()
    assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS))
    assertEquals(1, runs.get())
  }

  @Test
  fun aFailedActionRunsAgainOnTheNextCall() {
    val runs = AtomicInteger()
    val once = RunOnce<Unit> {
      if (runs.incrementAndGet() == 1) throw IllegalStateException("first")
    }
    runCatching { once.run(Unit) }
    once.run(Unit)
    once.run(Unit)
    assertEquals(2, runs.get())
  }
}
