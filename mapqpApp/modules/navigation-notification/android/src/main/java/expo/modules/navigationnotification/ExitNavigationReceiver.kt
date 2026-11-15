package expo.modules.navigationnotification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import expo.modules.taskmanager.TaskService

class ExitNavigationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val scope = intent.getStringExtra("scope") ?: return
    val task = intent.getStringExtra("task") ?: return
    if (task != "mapqp-navigation-location") return
    // Persist before stopping, so queued/headless fixes and a later app resume
    // cannot revive a route after the user exits from the notification.
    context.getSharedPreferences("mapqp-navigation", Context.MODE_PRIVATE)
      .edit().putBoolean("exitRequested", true).apply()
    NavigationNotificationModule.current.get()?.onExit()
    try {
      val tasks = TaskService(context)
      if (tasks.hasRegisteredTask(task, scope)) tasks.unregisterTask(task, scope, null)
    } catch (error: Exception) {
      Log.w("NavigationNotification", "Unable to unregister exited route", error)
    }
  }
}
