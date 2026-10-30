plugins {
    id("com.android.application")
}

val build = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "app.transcritor"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.transcritor"
        minSdk = 29
        targetSdk = 34
        versionCode = build
        versionName = "1.0.$build"
    }

    signingConfigs {
        create("release") {
            storeFile = file("transcritor.jks")
            storePassword = "transcritor"
            keyAlias = "transcritor"
            keyPassword = "transcritor"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    androidResources {
        noCompress += listOf("html", "js", "css")
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
