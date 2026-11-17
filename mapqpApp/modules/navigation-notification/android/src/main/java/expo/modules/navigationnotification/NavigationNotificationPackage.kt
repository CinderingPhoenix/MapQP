package expo.modules.navigationnotification

import android.app.Activity
import android.content.Context
import expo.modules.core.BasePackage
import expo.modules.core.interfaces.ReactActivityLifecycleListener

// Called by Expo's activity delegate before React Native receives onHostPause.
// Power-button locks do not necessarily send onUserLeaveHint.
class NavigationNotificationPackage : BasePackage() {
  override fun createReactActivityLifecycleListeners(activityContext: Context?): List<ReactActivityLifecycleListener> =
    listOf(object : ReactActivityLifecycleListener {
      override fun onPause(activity: Activity?) {
        NavigationNotificationModule.current.get()?.prepareForBackground()
      }
    })
}
