package app.transcritor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/** Mantém o app vivo enquanto transcreve (mesmo fora da tela) e mostra o progresso. */
public class Trabalho extends Service {

    static final String CANAL_PROGRESSO = "progresso";
    static final String CANAL_PRONTO = "pronto";
    static final int ID_PROGRESSO = 1;
    static final int ID_PRONTO = 2;

    private PowerManager.WakeLock trava;

    static void criarCanais(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CANAL_PROGRESSO) == null) {
            NotificationChannel p = new NotificationChannel(CANAL_PROGRESSO, "Progresso da transcrição", NotificationManager.IMPORTANCE_LOW);
            p.setShowBadge(false);
            nm.createNotificationChannel(p);
        }
        if (nm.getNotificationChannel(CANAL_PRONTO) == null) {
            NotificationChannel f = new NotificationChannel(CANAL_PRONTO, "Transcrições prontas", NotificationManager.IMPORTANCE_DEFAULT);
            nm.createNotificationChannel(f);
        }
    }

    private static PendingIntent abrirApp(Context c) {
        Intent i = new Intent(c, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static Notification progresso(Context c, String titulo, String texto, int atual, int total) {
        criarCanais(c);
        return new Notification.Builder(c, CANAL_PROGRESSO)
                .setSmallIcon(R.drawable.ic_frente)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setProgress(Math.max(total, 1), Math.max(0, atual), total <= 0)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_PROGRESS)
                .setContentIntent(abrirApp(c))
                .build();
    }

    static Notification pronto(Context c, String titulo, String texto) {
        criarCanais(c);
        return new Notification.Builder(c, CANAL_PRONTO)
                .setSmallIcon(R.drawable.ic_frente)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_STATUS)
                .setContentIntent(abrirApp(c))
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String titulo = intent != null ? intent.getStringExtra("titulo") : null;
        String texto = intent != null ? intent.getStringExtra("texto") : null;
        int atual = intent != null ? intent.getIntExtra("atual", 0) : 0;
        int total = intent != null ? intent.getIntExtra("total", 0) : 0;
        Notification n = progresso(this, titulo == null ? "Transcrevendo" : titulo, texto == null ? "" : texto, atual, total);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(ID_PROGRESSO, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(ID_PROGRESSO, n);
        }
        if (trava == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            trava = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "transcritor:trabalho");
            trava.acquire(90 * 60 * 1000L);
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (trava != null && trava.isHeld()) trava.release();
        trava = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
