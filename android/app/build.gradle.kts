plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The signing key stays outside the repository. Pass -Pks=/path/to.jks -Pkspass=... to sign a release.
val ks: String? = providers.gradleProperty("ks").orNull

android {
    namespace = "app.healthsync"
    compileSdk = 36
    defaultConfig {
        applicationId = "app.healthsync"
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "PWA_URL", "\"https://yoyo196204-hub.github.io/Health/\"")
    }
    buildFeatures { buildConfig = true }
    signingConfigs {
        if (ks != null) create("release") {
            storeFile = file(ks)
            storePassword = providers.gradleProperty("kspass").get()
            keyAlias = "healthsync"
            keyPassword = providers.gradleProperty("kspass").get()
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            if (ks != null) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
