package expo.modules.navigationnotification

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.ComponentName
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.Bundle
import android.os.IBinder
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
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || foreground || exitRequested()) return false
    val context = appContext.reactContext ?: return false
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val active = manager.activeNotifications.firstOrNull {
      it.notification.channelId.endsWith(":" + taskName) &&
        (it.notification.flags and Notification.FLAG_FOREGROUND_SERVICE) != 0
    } ?: return false
    val scope = active.notification.channelId.removeSuffix(":" + taskName)
    val exit = PendingIntent.getBroadcast(context, 7412,
      Intent(context, ExitNavigationReceiver::class.java).putExtra("scope", scope).putExtra("task", taskName),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val arrival = if (maneuver == "off-route") "Open mapQP to update your route"
      else "Arrive ${DateFormat.getTimeFormat(context).format(Date(arrivalTime))}"
    val dark = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    val builder = Notification.Builder.recoverBuilder(context, active.notification)
      .setContentTitle(options?.getString("notificationBody"))
      .setContentText(arrival)
      .setLargeIcon(maneuverIcon(maneuver, if (dark) Color.WHITE else Color.BLACK))
      .setColor(Color.rgb(21, 84, 255)).setColorized(false)
      .setCategory(Notification.CATEGORY_NAVIGATION)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true).setOngoing(true).setShowWhen(false)
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
    val bound = service ?: return
    if (foreground) {
      bound.stopForeground(Service.STOP_FOREGROUND_REMOVE)
    } else {
      options?.let {
        try { bound.startForeground(it); renderNotification() }
        catch (error: RuntimeException) { Log.w("NavigationNotification", "Could not promote location service", error) }
      }
    }
  }

  private fun release() {
    connection?.let { appContext.reactContext?.unbindService(it) }
    connection = null
    service = null
    options = null
  }

  override fun definition() = ModuleDefinition {
    Name("NavigationNotification")
    Events("exitNavigation")
    OnCreate {
      current = WeakReference(this@NavigationNotificationModule)
      foreground = appContext.currentActivity?.hasWindowFocus() == true
    }
    OnActivityEntersForeground { foreground = true; applyVisibility() }
    // Promote the already-started/bound service before the activity leaves.
    OnUserLeavesActivity { foreground = false; applyVisibility() }
    OnActivityEntersBackground { foreground = false; applyVisibility() }
    OnDestroy { release() }
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
      val context = appContext.reactContext ?: return@AsyncFunction false
      this@NavigationNotificationModule.taskName = taskName
      this@NavigationNotificationModule.progress = progress.toInt().coerceIn(0, 100)
      this@NavigationNotificationModule.arrivalTime = arrivalTime.toLong()
      this@NavigationNotificationModule.maneuver = maneuver
      options = Bundle().apply {
        putString("notificationTitle", title)
        putString("notificationBody", body)
      }
      if (connection == null) {
        val next = object : ServiceConnection {
          override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            if (connection !== this) return
            service = (binder as? LocationTaskService.ServiceBinder)?.service
            applyVisibility()
          }
          override fun onServiceDisconnected(name: ComponentName) { service = null }
        }
        // Flags=0: never create or revive a cancelled navigation service.
        if (context.bindService(Intent(context, LocationTaskService::class.java), next, 0)) connection = next
      }
      applyVisibility()
      if (foreground) return@AsyncFunction true
      renderNotification()
    }.runOnQueue(Queues.MAIN)
  }
}
