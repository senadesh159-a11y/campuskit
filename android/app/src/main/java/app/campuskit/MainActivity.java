package app.campuskit;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;
import android.graphics.Color;

import androidx.browser.customtabs.CustomTabsIntent;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://campuskit-six.vercel.app/";
    private boolean launchAttempted = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(5, 22, 26));
        getWindow().setNavigationBarColor(Color.rgb(5, 22, 26));
        if (savedInstanceState == null) openCampusKit();
    }

    private boolean hasInternet() {
        try {
            ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (manager == null) return false;
            Network network = manager.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
            return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception ignored) {
            return true;
        }
    }

    private void openCampusKit() {
        if (launchAttempted) return;
        launchAttempted = true;
        if (!hasInternet()) {
            new AlertDialog.Builder(this)
                .setTitle("Internet connection required")
                .setMessage("CampusKit loads your live student workspace. Connect to the internet, then tap Retry.")
                .setCancelable(false)
                .setPositiveButton("Retry", (dialog, which) -> {
                    launchAttempted = false;
                    openCampusKit();
                })
                .setNegativeButton("Close", (dialog, which) -> finish())
                .show();
            return;
        }
        try {
            CustomTabsIntent customTabs = new CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setToolbarColor(Color.rgb(5, 22, 26))
                .setUrlBarHidingEnabled(false)
                .setShareState(CustomTabsIntent.SHARE_STATE_ON)
                .build();
            customTabs.launchUrl(this, Uri.parse(HOME_URL));
        } catch (Exception error) {
            try {
                Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse(HOME_URL));
                if (browser.resolveActivity(getPackageManager()) != null) {
                    startActivity(browser);
                } else {
                    Toast.makeText(this, "No supported browser found. Install or update Chrome and try again.", Toast.LENGTH_LONG).show();
                    finish();
                }
            } catch (Exception noBrowser) {
                Toast.makeText(this, "CampusKit could not open. Please update Chrome and try again.", Toast.LENGTH_LONG).show();
                finish();
            }
        }
    }
}
