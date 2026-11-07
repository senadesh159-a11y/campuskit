package app.campuskit;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.content.Intent;
import android.widget.Toast;

import androidx.browser.customtabs.CustomTabsIntent;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://campuskit-six.vercel.app/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(android.graphics.Color.rgb(5, 22, 26));
        getWindow().setNavigationBarColor(android.graphics.Color.rgb(5, 22, 26));
        openCampusKit();
    }

    private void openCampusKit() {
        try {
            CustomTabsIntent customTabs = new CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setUrlBarHidingEnabled(false)
                .build();
            customTabs.launchUrl(this, Uri.parse(HOME_URL));
        } catch (Exception error) {
            try {
                Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse(HOME_URL));
                startActivity(browser);
                finish();
            } catch (Exception noBrowser) {
                Toast.makeText(this, "Please install or update Chrome to open CampusKit.", Toast.LENGTH_LONG).show();
            }
        }
    }
}