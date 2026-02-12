/**
 * Expo app configuration
 * Este arquivo tem precedência sobre app.json para configurações dinâmicas
 */

export default {
  expo: {
    name: "Fitness Store",
    slug: "fitness-store-mobile",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    assetBundlePatterns: ["**/*"],

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.fitnessstore.mobile",
      infoPlist: {
        NSCameraUsageDescription: "Este app precisa acessar sua câmera para escanear códigos de barras de produtos.",
        NSUserNotificationsUsageDescription: "Este app precisa enviar notificações sobre envios condicionais e prazos.",
        ITSAppUsesNonExemptEncryption: false
      }
    },

    android: {
      package: "com.fitnessstore.mobile",
      permissions: [
        "android.permission.CAMERA",
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.VIBRATE"
      ],
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      }
    },

    web: {
      bundler: "metro"
    },

    scheme: "fitness-store",

    // EAS Update configuration - COMENTADO para permitir Expo Go
    // Descomentar quando for fazer build de producao
    // updates: {
    //   url: "https://u.expo.dev/f0cb590f-2113-48d5-ae4b-b3ca15d26639"
    // },
    // runtimeVersion: {
    //   policy: "appVersion"
    // },

    plugins: [
      "expo-router",
      "expo-font",
      [
        "expo-camera",
        {
          cameraPermission: "Permitir $(PRODUCT_NAME) acessar sua câmera para escanear códigos de barras"
        }
      ]
    ],

    extra: {
      router: {},
      eas: {
        projectId: "f0cb590f-2113-48d5-ae4b-b3ca15d26639"
      }
    },

    owner: "vscardoso2005"
  }
};
