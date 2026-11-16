package expo.modules.navigationnotification

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path

internal fun maneuverIcon(maneuver: String, color: Int = Color.BLACK, tracker: Boolean = false): Bitmap {
  val bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
  val canvas = Canvas(bitmap)
  val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    this.color = color
    strokeWidth = 10f
    strokeJoin = Paint.Join.ROUND
    strokeCap = Paint.Cap.SQUARE
    style = Paint.Style.STROKE
  }
  if (tracker) {
    canvas.drawCircle(48f, 48f, 47f, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = Color.rgb(21, 84, 255) })
    canvas.scale(0.65f, 0.65f, 48f, 48f)
    paint.color = Color.WHITE
  }
  val path = Path()
  when (maneuver) {
    "left", "right" -> {
      if (maneuver == "left") canvas.scale(-1f, 1f, 48f, 48f)
      path.moveTo(28f, 80f); path.lineTo(28f, 42f)
      path.quadTo(28f, 30f, 42f, 30f); path.lineTo(76f, 30f)
      path.moveTo(58f, 12f); path.lineTo(76f, 30f); path.lineTo(58f, 48f)
    }
    "uturn" -> {
      path.moveTo(72f, 80f); path.lineTo(72f, 35f)
      path.cubicTo(72f, 6f, 24f, 6f, 24f, 35f); path.lineTo(24f, 60f)
      path.moveTo(8f, 44f); path.lineTo(24f, 60f); path.lineTo(40f, 44f)
    }
    "arrive" -> {
      path.moveTo(28f, 82f); path.lineTo(28f, 14f); path.lineTo(76f, 14f)
      path.lineTo(64f, 32f); path.lineTo(76f, 50f); path.lineTo(28f, 50f)
    }
    "off-route" -> {
      path.moveTo(48f, 14f); path.lineTo(48f, 54f)
      path.moveTo(48f, 76f); path.lineTo(48f, 78f)
    }
    else -> {
      path.moveTo(48f, 80f); path.lineTo(48f, 14f)
      path.moveTo(24f, 38f); path.lineTo(48f, 14f); path.lineTo(72f, 38f)
    }
  }
  canvas.drawPath(path, paint)
  return bitmap
}
