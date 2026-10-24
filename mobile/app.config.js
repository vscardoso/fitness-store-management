/**
 * Expo app configuration
 * Este arquivo tem precedência sobre app.json para configurações dinâmicas
 * EAS Update: canal preview — atualizado automaticamente a cada push na main
 */

export default {
  expo: {
    name: "Provador",
    slug: "fitness-store-mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    assetBundlePatterns: ["**/*"],

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.fitnessstore.mobile",
      infoPlist: {
        NSCameraUsageDescription: "Precisamos acessar sua câmera para escanear produtos.",
        NSPhotoLibraryUsageDescription: "Precisamos acessar suas fotos para cadastrar produtos.",
        NSUserNotificationsUsageDescription: "Este app precisa enviar notificações sobre envios condicionais e prazos.",
        ITSAppUsesNonExemptEncryption: false
      }
    },

    android: {
      package: "com.fitnessstore.mobile",
      permissions: [
        "android.permission.CAMERA",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.VIBRATE"
      ],
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundImage: "./assets/adaptive-icon-background.png",
        backgroundColor: "#7C3AED"
      }
    },

    web: {
      bundler: "metro",
      favicon: "./assets/favicon.png"
    },

    scheme: "fitness-store",

    // EAS Update configuration
    updates: {
      url: "https://u.expo.dev/f0cb590f-2113-48d5-ae4b-b3ca15d26639"
    },
    runtimeVersion: {
      policy: "sdkVersion"
    },

    plugins: [
      "expo-router",
      "expo-font",
      [
        "expo-image-picker",
        {
          photosPermission: "Precisamos acessar suas fotos para cadastrar produtos.",
          cameraPermission: "Precisamos acessar sua câmera para escanear produtos."
        }
      ],
      [
        "expo-camera",
        {
          cameraPermission: "Precisamos acessar sua câmera para escanear produtos."
        }
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/notification-icon.png",
          color: "#7C3AED",
          sounds: []
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
