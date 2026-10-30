package app.transcritor;

import android.app.Activity;
import android.os.Bundle;
import android.view.MenuItem;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class LoginActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getActionBar() != null) getActionBar().setDisplayHomeAsUpEnabled(true);

        WebView web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        if (!MainActivity.userAgent.isEmpty()) s.setUserAgentString(MainActivity.userAgent);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                verificar();
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                verificar();
            }
        });
        web.loadUrl("https://www.instagram.com/accounts/login/");
    }

    private void verificar() {
        if (MainActivity.logado()) {
            CookieManager.getInstance().flush();
            setResult(RESULT_OK);
            finish();
        }
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == android.R.id.home) {
            finish();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }
}
