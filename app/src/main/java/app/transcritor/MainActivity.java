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

import org.json.JSONObject;

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

    private void tratarIntent(Intent intent) {
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction())) {
            String t = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (t != null) compartilhadoPendente = t;
        }
    }

    private void entregarCompartilhado() {
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
