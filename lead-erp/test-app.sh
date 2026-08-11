#!/bin/bash

# ╔══════════════════════════════════════════════════════════════╗
# ║  Codeskate CRM — App Test Script                             ║
# ║  Usage: bash test-app.sh [option]                            ║
# ╚══════════════════════════════════════════════════════════════╝

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   🚀 Codeskate CRM — Test Runner     ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════╝${NC}"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}⚠️  .env file nahi mila!${NC}"
  echo -e "   Pehle .env setup karo: ${GREEN}cp .env.example .env${NC}"
  echo -e "   Phir Firebase credentials dalo .env mein"
  echo ""
fi

# ─────────────────────────────────────
# Option 1: Browser mein test (mobile view)
# ─────────────────────────────────────
run_browser() {
  echo -e "${GREEN}📱 Browser mein mobile view start ho raha hai...${NC}"
  echo ""
  echo -e "${YELLOW}Tips:${NC}"
  echo "  1. Chrome kholo → F12 (DevTools) → Toggle Device Toolbar (Ctrl+Shift+M)"
  echo "  2. Device select karo: iPhone 14 Pro ya Pixel 7"
  echo "  3. App mobile jaisa dikhega with bottom nav, compact cards etc."
  echo ""
  npm run dev -- --host
}

# ─────────────────────────────────────
# Option 2: Build + Preview (production test)
# ─────────────────────────────────────
run_preview() {
  echo -e "${GREEN}🏗️  Production build bana raha hoon...${NC}"
  npm run build
  echo ""
  echo -e "${GREEN}✅ Build done! Preview server start ho raha hai...${NC}"
  echo -e "${YELLOW}Tips: Yeh production build hai — final app jaisa dikhega${NC}"
  echo ""
  npm run preview -- --host
}

# ─────────────────────────────────────
# Option 3: Android APK build (debug)
# ─────────────────────────────────────
run_android() {
  echo -e "${GREEN}📲 Android debug APK build ho raha hai...${NC}"
  echo ""

  # Check prerequisites
  if ! command -v java &> /dev/null; then
    echo -e "${RED}❌ Java/JDK install nahi hai!${NC}"
    echo "   Install karo: sudo apt install openjdk-17-jdk"
    exit 1
  fi

  if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    echo -e "${YELLOW}⚠️  ANDROID_HOME set nahi hai. Android SDK path check karo.${NC}"
  fi

  # Step 1: Build web assets
  echo -e "${CYAN}[1/4]${NC} Web build..."
  npm run build

  # Step 2: Sync with Capacitor
  echo -e "${CYAN}[2/4]${NC} Capacitor sync..."
  npx cap sync android

  # Step 3: Build debug APK
  echo -e "${CYAN}[3/4]${NC} Gradle build (debug APK)..."
  cd android
  ./gradlew assembleDebug
  cd ..

  # Step 4: Show APK location
  APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
  if [ -f "$APK_PATH" ]; then
    echo ""
    echo -e "${GREEN}✅ APK ready!${NC}"
    echo -e "   📍 Location: ${CYAN}$APK_PATH${NC}"
    echo ""
    echo -e "${YELLOW}Install on device:${NC}"
    echo "   adb install -r $APK_PATH"
    echo ""
    echo -e "${YELLOW}Ya device pe directly:${NC}"
    echo "   Phone ko USB connect karo → File transfer mode → APK copy karo → Install"
  else
    echo -e "${RED}❌ APK nahi bana. Gradle logs check karo.${NC}"
  fi
}

# ─────────────────────────────────────
# Option 4: Android Live Run (device connected)
# ─────────────────────────────────────
run_android_live() {
  echo -e "${GREEN}📲 Android device pe directly run ho raha hai...${NC}"
  echo ""

  if ! command -v adb &> /dev/null; then
    echo -e "${RED}❌ ADB nahi mila! Android SDK platform-tools install karo.${NC}"
    exit 1
  fi

  # Check device connected
  DEVICES=$(adb devices | grep -w "device" | wc -l)
  if [ "$DEVICES" -eq 0 ]; then
    echo -e "${RED}❌ Koi device connected nahi hai!${NC}"
    echo "   1. USB Debugging ON karo (Settings → Developer Options)"
    echo "   2. Phone USB se connect karo"
    echo "   3. 'Allow USB debugging' accept karo phone pe"
    exit 1
  fi

  echo -e "${CYAN}[1/3]${NC} Web build + Capacitor sync..."
  npm run build
  npx cap sync android

  echo -e "${CYAN}[2/3]${NC} Running on device..."
  npx cap run android

  echo ""
  echo -e "${GREEN}✅ App device pe launch ho gaya!${NC}"
}

# ─────────────────────────────────────
# Option 5: Android Studio mein kholo
# ─────────────────────────────────────
run_android_studio() {
  echo -e "${GREEN}🖥️  Android Studio mein open ho raha hai...${NC}"
  npm run build
  npx cap sync android
  npx cap open android
  echo -e "${GREEN}✅ Android Studio mein project khul gaya!${NC}"
  echo "   ▶️  Run button dabao (green play) device select karke"
}

# ─────────────────────────────────────
# MENU
# ─────────────────────────────────────
show_menu() {
  echo "Choose karo kaise test karna hai:"
  echo ""
  echo -e "  ${GREEN}1)${NC} browser     — Chrome DevTools mobile view mein (fastest)"
  echo -e "  ${GREEN}2)${NC} preview     — Production build + preview server"
  echo -e "  ${GREEN}3)${NC} apk         — Debug APK build karo (install manually)"
  echo -e "  ${GREEN}4)${NC} device      — Directly phone pe run karo (USB connected)"
  echo -e "  ${GREEN}5)${NC} studio      — Android Studio mein kholo"
  echo ""
  echo -e "Usage: ${CYAN}bash test-app.sh [1|2|3|4|5|browser|preview|apk|device|studio]${NC}"
  echo ""
}

# Parse argument
case "${1:-}" in
  1|browser)   run_browser ;;
  2|preview)   run_preview ;;
  3|apk)       run_android ;;
  4|device)    run_android_live ;;
  5|studio)    run_android_studio ;;
  *)           show_menu ;;
esac
