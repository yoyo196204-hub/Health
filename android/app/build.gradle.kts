plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The app's permanent key is android/release.p12, protected by a password that lives only in the GitHub secret
// HEALTH_KEYSTORE_PASSWORD. GitHub builds pass both in: -Pks=android/release.p12 and kspass (as an environment
// variable). Every version signed with it installs over the last one.
// Without them (any other computer), the build is signed with that machine's throwaway debug key and gets a
// different app ID and the name "Health test", so it can never be mistaken for, or installed over, the real app.
val ks: String? = providers.gradleProperty("ks").orNull
val signed = ks != null

android {
    namespace = "app.health"
    compileSdk = 36
    defaultConfig {
        // "app.health" was the ID of versions signed with keys that no longer exist; the new ID lets this one
        // install next to such a version, so data can be moved across before the old app is removed.
        applicationId = "app.health.personal"
        minSdk = 28
        targetSdk = 35
        versionCode = providers.gradleProperty("versionCode").orNull?.toInt() ?: 3
        versionName = providers.gradleProperty("versionName").orNull ?: "3.0"
    }
    buildFeatures { buildConfig = true }
    signingConfigs {
        if (signed) create("release") {
            storeFile = file(ks)
            storePassword = providers.gradleProperty("kspass").get()
            keyAlias = providers.gradleProperty("ksalias").orNull ?: "health"
            keyPassword = providers.gradleProperty("kspass").get()
        }
    }
    buildTypes {
        debug { manifestPlaceholders["appLabel"] = "Health test"; applicationIdSuffix = ".test" }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName(if (signed) "release" else "debug")
            if (!signed) applicationIdSuffix = ".test"
            manifestPlaceholders["appLabel"] = if (signed) "Health" else "Health test"
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

// The app is the web app: its files are copied in from the repository root on every build,
// so there is one copy of the code and the Android app never falls behind it.
val copyWeb by tasks.registering(Sync::class) {
    from(rootDir.parentFile) {
        include("index.html", "*.js", "*.css", "*.png", "manifest.webmanifest")
        exclude("sw.js")
    }
    into(layout.projectDirectory.dir("src/main/assets/www"))
}
tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
