package id.tilegrow.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// TileGrow: aplikasi pembungkus yang membuka game dari server online (lewat ngrok).
public class MainActivity extends Activity {
  private WebView web;
  private static final String ERR_HTML = "<html><head><meta name='viewport' content='width=device-width'></head><body style='background:#0f1830;color:#e8eefc;font-family:sans-serif;text-align:center;padding:40px'>"
    + "<h2>Tidak bisa terhubung ke server TileGrow</h2><p>Pastikan internet HP nyala, dan server di PC pemilik sedang jalan.</p>"
    + "<button style='font-size:18px;padding:10px 24px;border-radius:10px;border:0;background:#5bd16a' onclick='location.href=\"" + Config.SERVER_URL + "\"'>Coba lagi</button></body></html>";

  @Override protected void onCreate(Bundle b){
    super.onCreate(b);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    web = new WebView(this);
    web.setBackgroundColor(Color.rgb(15, 24, 48));
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);           // akun & pengaturan disimpan di localStorage
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setCacheMode(WebSettings.LOAD_NO_CACHE);
    // User-Agent bukan browser biasa: ngrok gratis tidak menampilkan halaman peringatan
    s.setUserAgentString("TileGrowApp/1.4 (Android)");
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r){
        return !r.getUrl().toString().startsWith(Config.SERVER_URL);   // hanya buka halaman server sendiri
      }
      @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e){
        if (r.isForMainFrame()) v.loadDataWithBaseURL(null, ERR_HTML, "text/html", "utf-8", null);
      }
    });
    setContentView(web);
    hideBars();
    if (b != null) web.restoreState(b); else web.loadUrl(Config.SERVER_URL);
  }
  private void hideBars(){
    web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
      | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
  }
  @Override public void onWindowFocusChanged(boolean f){ super.onWindowFocusChanged(f); if (f) hideBars(); }
  @Override protected void onSaveInstanceState(Bundle o){ super.onSaveInstanceState(o); web.saveState(o); }
  @Override protected void onPause(){ super.onPause(); web.onPause(); }
  @Override protected void onResume(){ super.onResume(); web.onResume(); }
  @Override public void onBackPressed(){ if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
