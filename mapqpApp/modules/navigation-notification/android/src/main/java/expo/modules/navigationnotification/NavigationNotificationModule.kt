package expo.modules.navigationnotification

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.content.Context
import android.content.ComponentName
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.PowerManager
import android.os.Handler
import android.os.Looper
import android.service.notification.StatusBarNotification
import android.app.Service
import android.util.Log
import android.graphics.Color
import android.graphics.drawable.Icon
import android.content.res.Configuration
import android.text.format.DateFormat
import java.util.Date
import java.lang.ref.WeakReference
import expo.modules.location.services.LocationTaskService
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NavigationNotificationModule : Module() {
  private var service: LocationTaskService? = null
  private var connection: ServiceConnection? = null
  private var foreground = false
  private var options: Bundle? = null
  private var taskName = "mapqp-navigation-location"
  private var progress = 0
  private var arrivalTime = 0L
  private var maneuver = "straight"
  private var screenContext: Context? = null
  private var cachedNotification: StatusBarNotification? = null
  private var serviceInForeground = false
  private val handler = Handler(Looper.getMainLooper())
  private var refreshAttempts = 0
  private val refresh = object : Runnable {
    override fun run() {
      if (options == null || exitRequested()) return
      if (service == null || isAppVisible()) applyVisibility()
      else if (!renderNotification()) scheduleRefresh()
    }
  }

  private fun scheduleRefresh() {
    if (refreshAttempts++ >= 10) return
    handler.removeCallbacks(refresh)
    handler.postDelayed(refresh, 100)
  }

  private fun findNotification(): StatusBarNotification? {
    val context = appContext.reactContext ?: return null
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.activeNotifications.firstOrNull {
      it.notification.channelId.endsWith(":" + taskName) &&
        (it.notification.flags and Notification.FLAG_FOREGROUND_SERVICE) != 0
    }?.let { cachedNotification = it }
    return cachedNotification
  }

  fun prepareForBackground() {
    foreground = false
    refreshAttempts = 0
    applyVisibility()
  }

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == Intent.ACTION_SCREEN_OFF) foreground = false
      refreshAttempts = 0
      applyVisibility()
    }
  }

  // A resumed activity can still be behind the keyguard. Hide directions only
  // when the user can actually see the app, never just because it is resumed.
  private fun isAppVisible(): Boolean {
    val context = appContext.reactContext ?: return false
    val locked = (context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager)?.isKeyguardLocked == true
    val interactive = (context.getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isInteractive != false
    return foreground && interactive && !locked
  }

  companion object {
    var current = WeakReference<NavigationNotificationModule>(null)
  }

  fun onExit() {
    service?.stop()
    release()
    runCatching { sendEvent("exitNavigation", Bundle()) }
      .onFailure { Log.w("NavigationNotification", "Exit will be applied when JavaScript resumes", it) }
  }

  private fun exitRequested(): Boolean = appContext.reactContext
    ?.getSharedPreferences("mapqp-navigation", Context.MODE_PRIVATE)?.getBoolean("exitRequested", false) == true

  private fun renderNotification(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || isAppVisible() || exitRequested()) return false
    val context = appContext.reactContext ?: return false
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val active = findNotification() ?: return false
    val scope = active.notification.channelId.removeSuffix(":" + taskName)
    val exit = PendingIntent.getBroadcast(context, 7412,
      Intent(context, ExitNavigationReceiver::class.java).putExtra("scope", scope).putExtra("task", taskName),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val arrival = if (maneuver == "off-route") "Updating your route"
      else "Arrive ${DateFormat.getTimeFormat(context).format(Date(arrivalTime))}"
    val dark = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    val builder = Notification.Builder.recoverBuilder(context, active.notification)
      .setContentTitle(options?.getString("notificationBody"))
      .setContentText(arrival)
      .setLargeIcon(maneuverIcon(maneuver, if (dark) Color.WHITE else Color.BLACK))
      .setColor(Color.rgb(21, 84, 255)).setColorized(false)
      .setCategory(Notification.CATEGORY_NAVIGATION)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setPublicVersion(null)
      .setOnlyAlertOnce(true).setOngoing(true).setShowWhen(false)
      // Suppress alerts even if an existing channel was configured to vibrate.
      // This is a non-summary notification; only a summary could alert in this group.
      .setGroup("mapqp-silent-navigation").setGroupSummary(false)
      .setGroupAlertBehavior(Notification.GROUP_ALERT_SUMMARY)
      .setDefaults(0).setSound(null).setVibrate(null)
      .setActions(Notification.Action.Builder(null, "Exit navigation", exit).build())
    if (Build.VERSION.SDK_INT >= 36) {
      builder.setStyle(Notification.ProgressStyle()
        .setProgressSegments(listOf(Notification.ProgressStyle.Segment(100).setColor(Color.rgb(21, 84, 255))))
        .setProgress(progress)
        .setProgressTrackerIcon(Icon.createWithBitmap(maneuverIcon("straight", tracker = true))))
        .setRequestPromotedOngoing(true)
    } else {
      builder.setStyle(Notification.BigTextStyle().bigText("${options?.getString("notificationBody")}\n$arrival"))
        .setProgress(100, progress, false)
    }
    manager.notify(active.tag, active.id, builder.build())
    return true
  }

  private fun applyVisibility() {
    if (exitRequested()) return
    if (options == null) return
    ensureBinding()
    val bound = service ?: run { scheduleRefresh(); return }
    if (isAppVisible()) {
      // Capture the ID/channel/launch intent before removing the notification.
      // startForeground() posts asynchronously, so lookup immediately after it
      // is not guaranteed to find the notification on a power-button lock.
      if (findNotification() != null) {
        bound.stopForeground(Service.STOP_FOREGROUND_REMOVE)
        serviceInForeground = false
      }
      else scheduleRefresh()
    } else {
      options?.let {
        try {
          // Reposting Expo's default service card on every GPS fix discards
          // ONLY_ALERT_ONCE and can buzz before the styled update replaces it.
          if (!serviceInForeground) {
            bound.startForeground(it)
            serviceInForeground = true
          }
          renderNotification()
          // Apply again once Android has processed the service's default card.
          scheduleRefresh()
        }
        catch (error: RuntimeException) { Log.w("NavigationNotification", "Could not promote location service", error) }
      }
    }
  }

  private fun ensureBinding() {
    val context = appContext.reactContext ?: return
    if (connection != null) return
    val next = object : ServiceConnection {
      override fun onServiceConnected(name: ComponentName, binder: IBinder) {
        if (connection !== this) return
        service = (binder as? LocationTaskService.ServiceBinder)?.service
        applyVisibility()
      }
      override fun onServiceDisconnected(name: ComponentName) {
        service = null
        serviceInForeground = false
        cachedNotification = null
      }
    }
    // Do not create a new service; retry briefly if Expo is still starting it.
    if (context.bindService(Intent(context, LocationTaskService::class.java), next, 0)) connection = next
  }

  private fun release() {
    handler.removeCallbacks(refresh)
    connection?.let { appContext.reactContext?.unbindService(it) }
    connection = null
    service = null
    serviceInForeground = false
    options = null
    cachedNotification = null
  }

  override fun definition() = ModuleDefinition {
    Name("NavigationNotification")
    Events("exitNavigation")
    OnCreate {
      current = WeakReference(this@NavigationNotificationModule)
      foreground = appContext.currentActivity?.hasWindowFocus() == true
      appContext.reactContext?.applicationContext?.let { context ->
        val filter = IntentFilter().apply {
          addAction(Intent.ACTION_SCREEN_OFF)
          addAction(Intent.ACTION_SCREEN_ON)
          addAction(Intent.ACTION_USER_PRESENT)
        }
        if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        else context.registerReceiver(screenReceiver, filter)
        screenContext = context
      }
    }
    OnActivityEntersForeground { foreground = true; refreshAttempts = 0; applyVisibility() }
    // Promote the already-started/bound service before the activity leaves.
    OnUserLeavesActivity { prepareForBackground() }
    OnActivityEntersBackground { prepareForBackground() }
    OnDestroy {
      screenContext?.unregisterReceiver(screenReceiver)
      screenContext = null
      release()
    }
    AsyncFunction("clear") { release() }.runOnQueue(Queues.MAIN)
    AsyncFunction("isExitRequested") { exitRequested() }
    AsyncFunction("consumeExitRequest") {
      val exited = exitRequested()
      if (exited) appContext.reactContext?.getSharedPreferences("mapqp-navigation", Context.MODE_PRIVATE)
        ?.edit()?.remove("exitRequested")?.apply()
      exited
    }.runOnQueue(Queues.MAIN)

    // Update the existing location-service notification, preserving its ID,
    // channel, launch intent, icon, and foreground-service lifecycle. Restarting
    // the location service to change text is prohibited while backgrounded.
    AsyncFunction("update") { taskName: String, title: String, body: String, progress: Double, arrivalTime: Double, maneuver: String ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@AsyncFunction false
      if (exitRequested()) return@AsyncFunction false
      if (appContext.reactContext == null) return@AsyncFunction false
      refreshAttempts = 0
      this@NavigationNotificationModule.taskName = taskName
      this@NavigationNotificationModule.progress = progress.toInt().coerceIn(0, 100)
      this@NavigationNotificationModule.arrivalTime = arrivalTime.toLong()
      this@NavigationNotificationModule.maneuver = maneuver
      options = Bundle().apply {
        putString("notificationTitle", title)
        putString("notificationBody", body)
      }
      applyVisibility()
      if (isAppVisible()) return@AsyncFunction true
      renderNotification()
    }.runOnQueue(Queues.MAIN)
  }
}
