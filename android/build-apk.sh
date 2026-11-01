#!/usr/bin/env bash
# Build APK TileGrow tanpa Gradle. Butuh JDK 17 + Android SDK (platforms;android-35, build-tools;35.0.0).
# Pakai (git-bash): bash android/build-apk.sh   -> hasil: dist/TileGrow-v1.4.apk
set -euo pipefail
cd "$(dirname "$0")"
JAVA_HOME="${TG_JDK:-$(ls -d "C:/Program Files/Microsoft/jdk-17"* | head -1)}"; export PATH="$(cygpath -u "$JAVA_HOME")/bin:$PATH"
SDK="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"; BT="$SDK/build-tools/35.0.0"; JAR="$SDK/platforms/android-35/android.jar"
KS="$(cygpath -m "${TILEGROW_KEYSTORE:-$HOME/.tilegrow/tilegrow-release.jks}")"
rm -rf build && mkdir -p build/classes build/dex
"$BT/aapt2.exe" compile --dir res -o build/res.zip
"$BT/aapt2.exe" link -o build/base.apk -I "$JAR" --manifest AndroidManifest.xml --min-sdk-version 24 --target-sdk-version 35 build/res.zip
javac -source 8 -target 8 -nowarn -Xlint:-options -cp "$JAR" -d build/classes $(find src -name '*.java')
"$BT/d8.bat" --release --min-api 24 --lib "$JAR" --output build/dex $(find build/classes -name '*.class')
cp build/base.apk build/unsigned.apk
(cd build/dex && jar uf ../unsigned.apk classes.dex)
"$BT/zipalign.exe" -f -p 4 build/unsigned.apk build/aligned.apk
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  PW=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'); printf '%s' "$PW" > "$KS.pass"; chmod 600 "$KS.pass"
  set +x; keytool -genkeypair -keystore "$KS" -storepass "$PW" -keypass "$PW" -alias tilegrow -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=TileGrow" >/dev/null 2>&1
fi
mkdir -p ../dist
"$BT/apksigner.bat" sign --ks "$KS" --ks-pass "file:$KS.pass" --ks-key-alias tilegrow --out ../dist/TileGrow-v1.4.apk build/aligned.apk
"$BT/apksigner.bat" verify ../dist/TileGrow-v1.4.apk && echo "APK OK: dist/TileGrow-v1.4.apk"
