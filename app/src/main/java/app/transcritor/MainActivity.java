package app.transcritor;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.HapticFeedbackConstants;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.media.MediaMuxer;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileInputStream;
import java.nio.ByteBuffer;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends Activity {

    static final String ORIGEM = "https://appassets.androidplatform.net";
    static String userAgent = "";

    private WebView web;
    private WebView ig;
    private boolean igPronto = false;
    private final List<String> igFila = new ArrayList<>();
    private String gancho = "";
    private boolean igVisivel = false;
    private String compartilhadoPendente = null;
    private boolean paginaPronta = false;
    private String arquivosPendentes = null;
    static final int PEDIR_ARQUIVO = 11;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(true);

        FrameLayout raiz = new FrameLayout(this);
        ig = new WebView(this);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0E0E12);
        raiz.addView(ig, new FrameLayout.LayoutParams(-1, -1));
        raiz.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(raiz);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        userAgent = s.getUserAgentString().replace("; wv", "");
        s.setUserAgentString(userAgent);

        CookieManager.getInstance().setAcceptCookie(true);
        prepararIg();

        web.addJavascriptInterface(new Ponte(), "Android");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!"appassets.androidplatform.net".equals(u.getHost())) return null;
                String path = u.getPath() == null ? "/" : u.getPath();
                try {
                    if (path.startsWith("/ig/")) {
                        String alvo = "https://www.instagram.com/" + path.substring(4)
                                + (u.getEncodedQuery() != null ? "?" + u.getEncodedQuery() : "");
                        return proxy(alvo, true);
                    }
                    if (path.equals("/arquivo")) {
                        String alvo = u.getQueryParameter("u");
                        if (alvo == null) return erro(400, "sem arquivo");
                        return arquivo(Uri.parse(alvo));
                    }
                    if (path.equals("/cdn")) {
                        String alvo = u.getQueryParameter("u");
                        if (alvo == null) return erro(400, "sem url");
                        String host = Uri.parse(alvo).getHost();
                        if (host == null || !(host.endsWith("cdninstagram.com") || host.endsWith("fbcdn.net")))
                            return erro(403, "host bloqueado");
                        return proxy(alvo, false);
                    }
                    return asset(path);
                } catch (Exception e) {
                    return erro(502, String.valueOf(e.getMessage()));
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                paginaPronta = true;
                entregarCompartilhado();
            }
        });

        tratarIntent(getIntent());
        web.loadUrl(ORIGEM + "/index.html");
    }

    // ---------- servidor local ----------

    private Map<String, String> cabecalhos() {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cross-Origin-Opener-Policy", "same-origin");
        h.put("Cross-Origin-Embedder-Policy", "credentialless");
        h.put("Cross-Origin-Resource-Policy", "cross-origin");
        h.put("Cache-Control", "no-cache");
        return h;
    }

    private WebResourceResponse asset(String path) throws Exception {
        if (path.equals("/") || path.isEmpty()) path = "/index.html";
        if (path.contains("..")) return erro(403, "proibido");
        String nome = "web" + path;
        String mime = "application/octet-stream";
        if (nome.endsWith(".html")) mime = "text/html";
        else if (nome.endsWith(".js") || nome.endsWith(".mjs")) mime = "text/javascript";
        else if (nome.endsWith(".css")) mime = "text/css";
        else if (nome.endsWith(".svg")) mime = "image/svg+xml";
        else if (nome.endsWith(".png")) mime = "image/png";
        else if (nome.endsWith(".json")) mime = "application/json";
        InputStream in;
        try {
            in = getAssets().open(nome);
        } catch (Exception e) {
            return erro(404, "não encontrado");
        }
        return new WebResourceResponse(mime, "utf-8", 200, "OK", cabecalhos(), in);
    }

    private WebResourceResponse proxy(String alvo, boolean instagram) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(alvo).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(20000);
        c.setReadTimeout(60000);
        c.setRequestProperty("User-Agent", userAgent);
        c.setRequestProperty("Accept", "*/*");
        c.setRequestProperty("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8");
        c.setRequestProperty("Referer", "https://www.instagram.com/");
        if (instagram) {
            c.setRequestProperty("X-IG-App-ID", "936619743392459");
            c.setRequestProperty("X-Requested-With", "XMLHttpRequest");
            c.setRequestProperty("X-ASBD-ID", "129477");
            String cookies = CookieManager.getInstance().getCookie("https://www.instagram.com");
            if (cookies != null) {
                c.setRequestProperty("Cookie", cookies);
                for (String p : cookies.split(";")) {
                    p = p.trim();
                    if (p.startsWith("csrftoken=")) c.setRequestProperty("X-CSRFToken", p.substring(10));
                }
            }
        }
        int status = c.getResponseCode();
        String tipo = c.getContentType() == null ? "application/octet-stream" : c.getContentType();
        String mime = tipo.split(";")[0].trim();
        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
        if (in == null) in = new ByteArrayInputStream(new byte[0]);
        String motivo = c.getResponseMessage();
        if (motivo == null || motivo.isEmpty()) motivo = "OK";
        if (status < 100 || status > 599) status = 502;
        if (status >= 300 && status < 400) status = 502;
        return new WebResourceResponse(mime, "utf-8", status, motivo, cabecalhos(), in);
    }

    private WebResourceResponse erro(int status, String msg) {
        return new WebResourceResponse("text/plain", "utf-8", status, "Erro", cabecalhos(),
                new ByteArrayInputStream(msg.getBytes(StandardCharsets.UTF_8)));
    }

    // ---------- arquivos do celular (extrai só o áudio do vídeo) ----------

    private WebResourceResponse arquivo(Uri uri) throws Exception {
        String[] tipo = new String[1];
        File f = null;
        try {
            f = extrairAudio(uri, tipo);
        } catch (Exception ignored) {
        }
        if (f != null) return new WebResourceResponse(tipo[0], null, 200, "OK", cabecalhos(), new FileInputStream(f));
        InputStream in = getContentResolver().openInputStream(uri);
        if (in == null) return erro(404, "arquivo sumiu");
        String mime = getContentResolver().getType(uri);
        return new WebResourceResponse(mime == null ? "application/octet-stream" : mime, null, 200, "OK", cabecalhos(), in);
    }

    /** Copia a faixa de áudio do vídeo para um .m4a (ou .webm) sem recodificar. Devolve null se não der. */
    private File extrairAudio(Uri uri, String[] tipoSaida) throws Exception {
        String chave = Integer.toHexString(uri.toString().hashCode());
        File m4a = new File(getCacheDir(), "audio-" + chave + ".m4a");
        File webm = new File(getCacheDir(), "audio-" + chave + ".webm");
        if (m4a.length() > 0) { tipoSaida[0] = "audio/mp4"; return m4a; }
        if (webm.length() > 0) { tipoSaida[0] = "audio/webm"; return webm; }
        MediaExtractor ex = new MediaExtractor();
        MediaMuxer mx = null;
        File saida = null;
        try {
            ex.setDataSource(this, uri, null);
            int faixa = -1;
            MediaFormat fmt = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String m = f.getString(MediaFormat.KEY_MIME);
                if (m != null && m.startsWith("audio/")) { faixa = i; fmt = f; break; }
            }
            if (faixa < 0) throw new Exception("sem áudio");
            String mime = fmt.getString(MediaFormat.KEY_MIME);
            int formato;
            if ("audio/mp4a-latm".equals(mime)) { formato = MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4; saida = m4a; tipoSaida[0] = "audio/mp4"; }
            else if ("audio/opus".equals(mime) || "audio/vorbis".equals(mime)) { formato = MediaMuxer.OutputFormat.MUXER_OUTPUT_WEBM; saida = webm; tipoSaida[0] = "audio/webm"; }
            else return null;
            File tmp = new File(getCacheDir(), saida.getName() + ".tmp");
            mx = new MediaMuxer(tmp.getAbsolutePath(), formato);
            int t = mx.addTrack(fmt);
            mx.start();
            ex.selectTrack(faixa);
            int tam = fmt.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE) ? Math.max(fmt.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE), 1 << 16) : 1 << 20;
            ByteBuffer buf = ByteBuffer.allocate(tam);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            while (true) {
                int n = ex.readSampleData(buf, 0);
                if (n < 0) break;
                info.offset = 0;
                info.size = n;
                info.presentationTimeUs = Math.max(0, ex.getSampleTime());
                info.flags = (ex.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;
                mx.writeSampleData(t, buf, info);
                ex.advance();
            }
            mx.stop();
            mx.release();
            mx = null;
            if (!tmp.renameTo(saida)) return null;
            limparCache();
            return saida;
        } finally {
            try { ex.release(); } catch (Exception ignored) {}
            if (mx != null) try { mx.release(); } catch (Exception ignored) {}
        }
    }

    private void limparCache() {
        File[] fs = getCacheDir().listFiles((d, n) -> n.startsWith("audio-"));
        if (fs == null || fs.length <= 20) return;
        java.util.Arrays.sort(fs, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
        for (int i = 0; i < fs.length - 20; i++) fs[i].delete();
    }

    private JSONObject infoArquivo(Uri uri) {
        JSONObject o = new JSONObject();
        try {
            o.put("uri", uri.toString());
            String nome = null;
            long tam = 0;
            try (android.database.Cursor c = getContentResolver().query(uri, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (i >= 0) nome = c.getString(i);
                    int j = c.getColumnIndex(OpenableColumns.SIZE);
                    if (j >= 0 && !c.isNull(j)) tam = c.getLong(j);
                }
            } catch (Exception ignored) {
            }
            o.put("nome", nome == null ? "arquivo" : nome);
            o.put("tamanho", tam);
            String mime = getContentResolver().getType(uri);
            o.put("tipo", mime == null ? "" : mime);
            MediaMetadataRetriever r = new MediaMetadataRetriever();
            try {
                r.setDataSource(this, uri);
                String d = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                if (d != null) o.put("duracao", Long.parseLong(d) / 1000.0);
            } catch (Exception ignored) {
            } finally {
                try { r.release(); } catch (Exception ignored) {}
            }
        } catch (Exception ignored) {
        }
        return o;
    }

    private void receberArquivos(List<Uri> uris, boolean persistir) {
        new Thread(() -> {
            JSONArray lista = new JSONArray();
            for (Uri u : uris) {
                if (persistir) {
                    try { getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) {}
                }
                lista.put(infoArquivo(u));
            }
            arquivosPendentes = lista.toString();
            runOnUiThread(this::entregarCompartilhado);
        }).start();
    }

    private Uri gravarAudio(Uri uri, String nome) throws Exception {
        String[] tipo = new String[1];
        File f = extrairAudio(uri, tipo);
        if (f == null) throw new Exception("formato de áudio não suportado");
        String base = nome == null ? "audio" : nome.replaceAll("\\.[A-Za-z0-9]{2,4}$", "");
        String ext = f.getName().endsWith(".webm") ? ".webm" : ".m4a";
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, base + ext);
        v.put(MediaStore.MediaColumns.MIME_TYPE, tipo[0]);
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Transcritor");
        Uri destino = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (destino == null) throw new Exception("não consegui criar o arquivo");
        try (InputStream in = new FileInputStream(f); OutputStream out = getContentResolver().openOutputStream(destino)) {
            byte[] b = new byte[65536];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
        }
        return destino;
    }

    // ---------- página escondida do Instagram (faz as buscas como o próprio site) ----------

    private void prepararIg() {
        WebSettings s = ig.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setBlockNetworkImage(true);
        s.setUserAgentString(userAgent);
        CookieManager.getInstance().setAcceptThirdPartyCookies(ig, true);
        ig.addJavascriptInterface(new PonteIg(), "IGPonte");
        gancho = lerAsset("web/ig-hook.js");
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
                WebViewCompat.addDocumentStartJavaScript(ig, gancho, Collections.singleton("https://www.instagram.com"));
        } catch (Exception ignored) {
        }
        ig.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                view.evaluateJavascript(gancho, null);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(gancho + ";window.__tcVarre&&__tcVarre();window.__tcEstado&&__tcEstado();", null);
                if (url != null && url.startsWith("https://www.instagram.com")) {
                    igPronto = true;
                    for (String c : igFila) ig.evaluateJavascript(c, null);
                    igFila.clear();
                }
            }
        });
        carregarIg();
    }

    private void mostrarIg(boolean sim) {
        runOnUiThread(() -> {
            igVisivel = sim;
            web.setVisibility(sim ? android.view.View.GONE : android.view.View.VISIBLE);
            ig.getSettings().setBlockNetworkImage(!sim);
            if (sim) Toast.makeText(this, "Página do Instagram. Toque em voltar para retornar.", Toast.LENGTH_LONG).show();
            else js("window.aoEntrar && window.aoEntrar(" + logado() + ")");
        });
    }

    private void carregarIg() {
        runOnUiThread(() -> {
            igPronto = false;
            ig.loadUrl("https://www.instagram.com/");
        });
    }

    private static final String IG_JS =
            "(function(){var h={'X-Requested-With':'XMLHttpRequest','X-ASBD-ID':'129477'};" +
            "var a=null;try{var m1=document.documentElement.innerHTML.match(/appId\\W+(\\d{6,})/);if(m1)a=m1[1];}catch(e){}" +
            "if(!a)a=/Mobi|Android/.test(navigator.userAgent)?'1217981644879628':'936619743392459';h['X-IG-App-ID']=a;" +
            "var m=document.cookie.match(/csrftoken=([^;]+)/);if(m)h['X-CSRFToken']=m[1];" +
            "try{var w=sessionStorage.getItem('www-claim-v2');if(w)h['X-IG-WWW-Claim']=w;}catch(e){}" +
            "var t=setTimeout(function(){IGPonte.resposta(__ID__,0,'tempo esgotado')},30000);" +
            "fetch(__PATH__,{headers:h,credentials:'include'}).then(function(r){return r.text().then(function(x){clearTimeout(t);IGPonte.resposta(__ID__,r.status,x)})})" +
            ".catch(function(e){clearTimeout(t);IGPonte.resposta(__ID__,0,String(e))})})()";

    private void igBuscar(int id, String caminho) {
        String c = IG_JS.replace("__ID__", String.valueOf(id)).replace("__PATH__", JSONObject.quote("/" + caminho));
        runOnUiThread(() -> {
            if (igPronto) ig.evaluateJavascript(c, null);
            else igFila.add(c);
        });
    }

    private String lerAsset(String nome) {
        try (InputStream in = getAssets().open(nome)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return b.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    class PonteIg {
        @JavascriptInterface
        public void dados(String texto) {
            js("window.igDados && window.igDados(" + JSONObject.quote(texto == null ? "" : texto) + ")");
        }

        @JavascriptInterface
        public void estado(String texto) {
            js("window.igEstadoPagina && window.igEstadoPagina(" + JSONObject.quote(texto == null ? "" : texto) + ")");
        }

        @JavascriptInterface
        public void resposta(int id, int status, String corpo) {
            js("window.igResposta && window.igResposta(" + id + "," + status + "," + JSONObject.quote(corpo == null ? "" : corpo) + ")");
        }
    }

    // ---------- compartilhar a partir do Instagram ----------

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        tratarIntent(intent);
        entregarCompartilhado();
    }

    @SuppressWarnings("deprecation")
    private void tratarIntent(Intent intent) {
        if (intent == null) return;
        String tipo = intent.getType() == null ? "" : intent.getType();
        boolean midia = tipo.startsWith("video/") || tipo.startsWith("audio/");
        if (midia && Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> us = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (us != null && !us.isEmpty()) receberArquivos(us, false);
            return;
        }
        if (midia && Intent.ACTION_SEND.equals(intent.getAction())) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) { List<Uri> l = new ArrayList<>(); l.add(u); receberArquivos(l, false); }
            return;
        }
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String t = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (t != null) compartilhadoPendente = t;
        }
    }

    private void entregarCompartilhado() {
        if (paginaPronta && arquivosPendentes != null) {
            String a = arquivosPendentes;
            arquivosPendentes = null;
            js("window.aoArquivos && window.aoArquivos(" + JSONObject.quote(a) + ")");
        }
        if (!paginaPronta || compartilhadoPendente == null) return;
        String t = compartilhadoPendente;
        compartilhadoPendente = null;
        js("window.aoCompartilhar && window.aoCompartilhar(" + JSONObject.quote(t) + ")");
    }

    private void js(String codigo) {
        runOnUiThread(() -> web.evaluateJavascript(codigo, null));
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (igVisivel) {
            mostrarIg(false);
            return;
        }
        web.evaluateJavascript("window.voltar ? window.voltar() : false", v -> {
            if (!"true".equals(v)) finish();
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PEDIR_ARQUIVO) {
            List<Uri> us = new ArrayList<>();
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    for (int i = 0; i < data.getClipData().getItemCount(); i++) us.add(data.getClipData().getItemAt(i).getUri());
                } else if (data.getData() != null) us.add(data.getData());
            }
            if (us.isEmpty()) js("window.aoArquivos && window.aoArquivos('[]')");
            else receberArquivos(us, true);
            return;
        }
        if (requestCode == 7) carregarIg();
        if (requestCode == 7) js("window.aoEntrar && window.aoEntrar(" + logado() + ")");
    }

    static boolean logado() {
        String c = CookieManager.getInstance().getCookie("https://www.instagram.com");
        return c != null && c.contains("sessionid=");
    }

    // ---------- ponte com a página ----------

    class Ponte {
        @JavascriptInterface
        public boolean logado() {
            return MainActivity.logado();
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void entrar() {
            runOnUiThread(() -> startActivityForResult(new Intent(MainActivity.this, LoginActivity.class), 7));
        }

        @JavascriptInterface
        public void sair() {
            CookieManager.getInstance().removeAllCookies(null);
            CookieManager.getInstance().flush();
        }

        @JavascriptInterface
        public void copiar(String texto) {
            runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("Transcrição", texto));
            });
        }

        @JavascriptInterface
        public void igAbrir(String url) {
            if (url == null || !url.startsWith("https://www.instagram.com/")) return;
            runOnUiThread(() -> {
                igPronto = false;
                ig.loadUrl(url);
            });
        }

        @JavascriptInterface
        public void notificar(String tipo, String titulo, String texto, int atual, int total) {
            runOnUiThread(() -> {
                try {
                    android.app.NotificationManager nm = getSystemService(android.app.NotificationManager.class);
                    if ("inicio".equals(tipo)) {
                        if (android.os.Build.VERSION.SDK_INT >= 33
                                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 9);
                        }
                        Intent i = new Intent(MainActivity.this, Trabalho.class);
                        i.putExtra("titulo", titulo); i.putExtra("texto", texto);
                        i.putExtra("atual", atual); i.putExtra("total", total);
                        startForegroundService(i);
                    } else if ("progresso".equals(tipo)) {
                        nm.notify(Trabalho.ID_PROGRESSO, Trabalho.progresso(MainActivity.this, titulo, texto, atual, total));
                    } else if ("fim".equals(tipo)) {
                        stopService(new Intent(MainActivity.this, Trabalho.class));
                        nm.cancel(Trabalho.ID_PROGRESSO);
                        nm.notify(Trabalho.ID_PRONTO, Trabalho.pronto(MainActivity.this, titulo, texto));
                    } else if ("parar".equals(tipo)) {
                        stopService(new Intent(MainActivity.this, Trabalho.class));
                        nm.cancel(Trabalho.ID_PROGRESSO);
                    }
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void groq(int id, String wavBase64, String chave, String idioma) {
            new Thread(() -> {
                int status = 0;
                String corpo;
                try {
                    byte[] audio = android.util.Base64.decode(wavBase64, android.util.Base64.DEFAULT);
                    String limite = "----transcritor" + System.nanoTime();
                    HttpURLConnection c = (HttpURLConnection) new URL("https://api.groq.com/openai/v1/audio/transcriptions").openConnection();
                    c.setDoOutput(true);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(120000);
                    c.setRequestMethod("POST");
                    c.setRequestProperty("Authorization", "Bearer " + chave);
                    c.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + limite);
                    try (OutputStream out = c.getOutputStream()) {
                        StringBuilder campos = new StringBuilder();
                        String[][] f = idioma == null || idioma.isEmpty() || "auto".equals(idioma)
                                ? new String[][]{{"model", "whisper-large-v3-turbo"}, {"response_format", "json"}, {"temperature", "0"}}
                                : new String[][]{{"model", "whisper-large-v3-turbo"}, {"response_format", "json"}, {"temperature", "0"}, {"language", idioma}};
                        for (String[] kv : f) {
                            campos.append("--").append(limite).append("\r\n")
                                    .append("Content-Disposition: form-data; name=\"").append(kv[0]).append("\"\r\n\r\n")
                                    .append(kv[1]).append("\r\n");
                        }
                        campos.append("--").append(limite).append("\r\n")
                                .append("Content-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\n")
                                .append("Content-Type: audio/wav\r\n\r\n");
                        out.write(campos.toString().getBytes(StandardCharsets.UTF_8));
                        out.write(audio);
                        out.write(("\r\n--" + limite + "--\r\n").getBytes(StandardCharsets.UTF_8));
                    }
                    status = c.getResponseCode();
                    InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    ByteArrayOutputStream b = new ByteArrayOutputStream();
                    if (in != null) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                        in.close();
                    }
                    corpo = b.toString("UTF-8");
                } catch (Exception e) {
                    corpo = String.valueOf(e.getMessage());
                }
                js("window.groqResposta && window.groqResposta(" + id + "," + status + "," + JSONObject.quote(corpo) + ")");
            }).start();
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void escolherArquivo() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"video/*", "audio/*"});
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(i, PEDIR_ARQUIVO);
                } catch (Exception e) {
                    Intent g = new Intent(Intent.ACTION_GET_CONTENT);
                    g.setType("video/*");
                    g.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(g, PEDIR_ARQUIVO);
                }
            });
        }

        @JavascriptInterface
        public void salvarAudio(String uri, String nome) {
            new Thread(() -> {
                String msg;
                boolean ok = false;
                try {
                    gravarAudio(Uri.parse(uri), nome);
                    ok = true;
                    msg = "Áudio salvo em Downloads/Transcritor";
                } catch (Exception e) {
                    msg = "Não consegui extrair o áudio: " + e.getMessage();
                }
                js("window.aoSalvarAudio && window.aoSalvarAudio(" + ok + "," + JSONObject.quote(msg) + ")");
            }).start();
        }

        @JavascriptInterface
        public void igMostrar(boolean sim) {
            mostrarIg(sim);
        }

        @JavascriptInterface
        public void igRolar() {
            runOnUiThread(() -> ig.evaluateJavascript(
                    "window.scrollBy(0,Math.max(1500,document.body.scrollHeight));window.__tcVarre&&__tcVarre();", null));
        }

        @JavascriptInterface
        public void igPedirEstado() {
            runOnUiThread(() -> ig.evaluateJavascript("window.__tcVarre&&__tcVarre();window.__tcEstado&&__tcEstado();", null));
        }

        @JavascriptInterface
        public void igFetch(int id, String caminho) {
            igBuscar(id, caminho);
        }

        @JavascriptInterface
        public String colar() {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData c = cm.getPrimaryClip();
                if (c == null || c.getItemCount() == 0) return "";
                CharSequence t = c.getItemAt(0).coerceToText(MainActivity.this);
                return t == null ? "" : t.toString();
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public String versao() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void aviso(String texto) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, texto, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void toque() {
            runOnUiThread(() -> web.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK));
        }

        @JavascriptInterface
        public void manterTelaLigada(boolean sim) {
            runOnUiThread(() -> {
                if (sim) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void abrirLink(String url) {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public String salvar(String nome, String conteudo) {
            Uri u = gravar(nome, conteudo);
            return u == null ? "" : u.toString();
        }

        @JavascriptInterface
        public void compartilhar(String nome, String conteudo) {
            Uri u = gravar(nome, conteudo);
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_SUBJECT, nome);
                if (u != null) {
                    i.putExtra(Intent.EXTRA_STREAM, u);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } else {
                    i.putExtra(Intent.EXTRA_TEXT, conteudo);
                }
                startActivity(Intent.createChooser(i, "Enviar transcrições"));
            });
        }

        @JavascriptInterface
        public void compartilharTexto(String conteudo) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, conteudo);
                startActivity(Intent.createChooser(i, "Enviar texto"));
            });
        }
    }

    private Uri gravar(String nome, String conteudo) {
        try {
            String pasta = Environment.DIRECTORY_DOWNLOADS + "/Transcritor/";
            try (android.database.Cursor c = getContentResolver().query(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    new String[]{MediaStore.MediaColumns._ID},
                    MediaStore.MediaColumns.DISPLAY_NAME + "=? AND " + MediaStore.MediaColumns.RELATIVE_PATH + "=?",
                    new String[]{nome, pasta}, null)) {
                if (c != null && c.moveToFirst()) {
                    Uri existente = android.content.ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, c.getLong(0));
                    try (OutputStream out = getContentResolver().openOutputStream(existente, "wt")) {
                        out.write(conteudo.getBytes(StandardCharsets.UTF_8));
                    }
                    return existente;
                }
            } catch (Exception ignored) {
            }
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, nome);
            v.put(MediaStore.MediaColumns.MIME_TYPE, "text/markdown");
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Transcritor");
            Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (u == null) return null;
            try (OutputStream out = getContentResolver().openOutputStream(u)) {
                out.write(conteudo.getBytes(StandardCharsets.UTF_8));
            }
            return u;
        } catch (Exception e) {
            return null;
        }
    }
}
