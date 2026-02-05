const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCustomAndroidManifest(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    
    // Ensure manifest has the proper structure
    if (!androidManifest.manifest) {
      androidManifest.manifest = {};
    }
    
    if (!androidManifest.manifest.application) {
      androidManifest.manifest.application = {};
    }
    
    // Get or create the main activity
    let mainActivity = null;
    if (androidManifest.manifest.application.length && Array.isArray(androidManifest.manifest.application)) {
      // Find main activity
      mainActivity = androidManifest.manifest.application.find(
        (activity) => activity.$['android:name'] === '.MainActivity'
      );
    } else if (androidManifest.manifest.application.activity) {
      mainActivity = androidManifest.manifest.application.activity;
    }
    
    if (!mainActivity) {
      // Create main activity if it doesn't exist
      mainActivity = {
        $: {
          'android:name': '.MainActivity',
          'android:exported': 'true',
          'android:launchMode': 'singleTop',
          'android:theme': '@style/Theme.App.SplashScreen'
        }
      };
      
      if (Array.isArray(androidManifest.manifest.application)) {
        androidManifest.manifest.application.push(mainActivity);
      } else {
        androidManifest.manifest.application.activity = mainActivity;
      }
    }
    
    // Ensure intent filters array exists
    if (!mainActivity['intent-filter']) {
      mainActivity['intent-filter'] = [];
    }
    
    // Add JSON file handling intent filters
    const jsonIntentFilters = [
      {
        action: [
          {
            $: {
              'android:name': 'android.intent.action.VIEW'
            }
          }
        ],
        category: [
          {
            $: {
              'android:name': 'android.intent.category.DEFAULT'
            }
          },
          {
            $: {
              'android:name': 'android.intent.category.BROWSABLE'
            }
          }
        ],
        data: [
          {
            $: {
              'android:mimeType': 'application/json'
            }
          }
        ]
      },
      {
        action: [
          {
            $: {
              'android:name': 'android.intent.action.VIEW'
            }
          }
        ],
        category: [
          {
            $: {
              'android:name': 'android.intent.category.DEFAULT'
            }
          },
          {
            $: {
              'android:name': 'android.intent.category.BROWSABLE'
            }
          }
        ],
        data: [
          {
            $: {
              'android:scheme': 'file'
            }
          },
          {
            $: {
              'android:mimeType': '*/*'
            }
          },
          {
            $: {
              'android:pathPattern': '.*\\.json'
            }
          }
        ]
      },
      {
        action: [
          {
            $: {
              'android:name': 'android.intent.action.VIEW'
            }
          }
        ],
        category: [
          {
            $: {
              'android:name': 'android.intent.category.DEFAULT'
            }
          },
          {
            $: {
              'android:name': 'android.intent.category.BROWSABLE'
            }
          }
        ],
        data: [
          {
            $: {
              'android:scheme': 'content'
            }
          },
          {
            $: {
              'android:mimeType': '*/*'
            }
          },
          {
            $: {
              'android:pathPattern': '.*\\.json'
            }
          }
        ]
      },
      {
        action: [
          {
            $: {
              'android:name': 'android.intent.action.OPEN_DOCUMENT'
            }
          }
        ],
        category: [
          {
            $: {
              'android:name': 'android.intent.category.DEFAULT'
            }
          }
        ],
        data: [
          {
            $: {
              'android:mimeType': 'application/json'
            }
          }
        ]
      }
    ];
    
    // Add the intent filters
    jsonIntentFilters.forEach((filter) => {
      // Check if this intent filter already exists
      const exists = mainActivity['intent-filter'].some((existingFilter) => {
        return JSON.stringify(existingFilter) === JSON.stringify(filter);
      });
      
      if (!exists) {
        mainActivity['intent-filter'].push(filter);
      }
    });
    
    return config;
  });
};
