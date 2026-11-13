plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// A release key can be passed in from outside the repository: -Pks=/path/to/key.p12 -Pkspass=...
// Without one, the build is signed with this machine's debug key.
val ks: String? = providers.gradleProperty("ks").orNull

android {
    namespace = "app.health"
    compileSdk = 36
    defaultConfig {
        applicationId = "app.health"
        minSdk = 28
        targetSdk = 35
        versionCode = 3
        versionName = "3.0"
    }
    buildFeatures { buildConfig = true }
    signingConfigs {
        if (ks != null) create("release") {
            storeFile = file(ks)
            storePassword = providers.gradleProperty("kspass").get()
            keyAlias = providers.gradleProperty("ksalias").orNull ?: "health"
            keyPassword = providers.gradleProperty("kspass").get()
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName(if (ks != null) "release" else "debug")
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
        include("index.html", "*.js", "*.css", "*.png", "manifest.webmanifest", "media/*.gif")
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
