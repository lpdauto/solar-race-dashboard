#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEClient.h>
#include <BLEAdvertisedDevice.h>

#include <Arduino_GFX_Library.h>
#include <ctype.h>
#include <math.h>

// ===================== WIFI / CLOUD =====================

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

const char* INGEST_URL = "https://solar-race-dashboard.vercel.app/api/telemetry/ingest";
const char* DISPLAY_URL = "https://solar-race-dashboard.vercel.app/api/vehicle/display";
const char* TELEMETRY_TOKEN = "PASTE_TELEMETRY_INGEST_TOKEN_HERE";

const unsigned long CLOUD_POST_INTERVAL_MS = 1000;
const unsigned long DISPLAY_PULL_INTERVAL_MS = 5000;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;
const uint16_t HTTPS_TIMEOUT_MS = 5000;

WebServer server(80);

// ===================== COLORS =====================

#define BLACK        0x0000
#define BLUE         0x001F
#define RED          0xF800
#define GREEN        0x07E0
#define CYAN         0x07FF
#define YELLOW       0xFFE0
#define WHITE        0xFFFF
#define GRAY         0x8410
#define DARKGRAY     0x4208
#define ORANGE       0xFD20
#define RX2_MAGENTA  0xF81F

// ===================== TFT SETUP =====================

Arduino_DataBus *bus = new Arduino_ESP32PAR16(
    11,  // DC / RS
    12,  // CS
    10,  // WR
    -1,  // RD unused

    1, 2, 4, 5,
    6, 7, 15, 16,
    17, 18, 8, 3,
    46, 9, 14, 21
);

Arduino_GFX *gfx = new Arduino_ILI9486(
    bus,
    13,
    1,
    false
);

// ===================== BLE TARGET =====================

static BLEAdvertisedDevice* targetDevice = nullptr;
static bool doConnect = false;
static bool connected = false;

static const char* TARGET_NAME_1 = "CONTROLDM";
static const char* TARGET_NAME_2 = "ND72680";
static const char* FARDIVER_NOTIFY_UUID = "0000ffec-0000-1000-8000-00805f9b34fb";

// ===================== TELEMETRY =====================

struct FarDriverTelemetry {
  String controllerSerial = "";
  String serialPart1 = "";
  String serialPart2 = "";

  float packetRateHz = 0.0;

  float rpm = 0.0;
  float speedMph = 0.0;
  float voltage = 0.0;
  float current = 0.0;
  float power = 0.0;

  float phaseA = 0.0;
  float phaseC = 0.0;

  float motorTemp = 0.0;
  float ctrlTemp = 0.0;

  float throttlePct = 0.0;
  float throttleRaw = 0.0;
  float throttleVoltage = 0.0;

  float modulation = 0.0;
  int gear = 0;
  int soc = 0;

  unsigned long packetCount = 0;
  unsigned long lastPacketMs = 0;

  int lastCloudStatus = 0;
  unsigned long lastCloudPostMs = 0;
  String lastCloudResponse = "";
};

struct DriverDisplayData {
  int soc = -1;
  float whPerMile = NAN;
  float checkpointDistanceMiles = NAN;
  String arrival = "--:--";
  String status = "WAITING DATA";
  float targetSpeedMph = 30.0;

  int lastDisplayHttpStatus = 0;
  unsigned long lastDisplayFetchMs = 0;
  String lastDisplayResponse = "";
};

FarDriverTelemetry tel;
DriverDisplayData driverDisplay;

unsigned long lastPacketCount = 0;
unsigned long lastScreenUpdate = 0;

bool speedCoeffValid = false;
float speedCoeff = 0.0;
uint16_t speedDenom = 0;

bool dashboardDrawn = false;

// ===================== HELPERS =====================

float cToF(float c) {
  return c * 9.0 / 5.0 + 32.0;
}

uint16_t u16le(const uint8_t* data, int offset) {
  return (uint16_t)data[offset] | ((uint16_t)data[offset + 1] << 8);
}

int16_t s16le(const uint8_t* data, int offset) {
  return (int16_t)u16le(data, offset);
}

uint32_t u24be(const uint8_t* data, int offset) {
  return ((uint32_t)data[offset] << 16) |
         ((uint32_t)data[offset + 1] << 8) |
         ((uint32_t)data[offset + 2]);
}

String asciiFromBytes(const uint8_t* data, int start, int len) {
  String out = "";
  for (int i = start; i < start + len; i++) {
    char c = (char)data[i];
    if (c >= 32 && c <= 126) out += c;
  }
  return out;
}

bool isCodeE2Frame(uint8_t frameId) {
  return frameId == 0x80 || frameId == 0x87 || frameId == 0x8E ||
         frameId == 0x95 || frameId == 0x9C || frameId == 0xA3 ||
         frameId == 0xAA || frameId == 0xB0;
}

bool isCodeE8Frame(uint8_t frameId) {
  return frameId == 0x81 || frameId == 0x88 || frameId == 0x8F ||
         frameId == 0x96 || frameId == 0x9D || frameId == 0xA4 ||
         frameId == 0xAB || frameId == 0xB1;
}

bool isCodeEEFrame(uint8_t frameId) {
  return frameId == 0x82 || frameId == 0x89 || frameId == 0x90 ||
         frameId == 0x97 || frameId == 0x9E || frameId == 0xA5 ||
         frameId == 0xAC || frameId == 0xB2;
}

unsigned long lastPacketAgeMs() {
  if (tel.lastPacketMs == 0) return 0;
  return millis() - tel.lastPacketMs;
}

bool telemetryFresh() {
  return connected && tel.lastPacketMs > 0 && lastPacketAgeMs() < 2000;
}

String connectionStatus() {
  if (!connected) return "ble_disconnected";
  if (!telemetryFresh()) return "stale";
  return "connected";
}

bool tokenConfigured() {
  return strlen(TELEMETRY_TOKEN) > 0 &&
         String(TELEMETRY_TOKEN) != "PASTE_TELEMETRY_INGEST_TOKEN_HERE";
}

bool displayCloudOK() {
  return driverDisplay.lastDisplayHttpStatus >= 200 &&
         driverDisplay.lastDisplayHttpStatus < 300;
}

// ===================== JSON =====================

String payloadJsonOnly() {
  String json = "{";

  json += "\"timestamp\":";
  json += String(millis());

  json += ",\"source\":\"esp32-fardriver-ble-tft\"";

  json += ",\"speedMph\":";
  json += String(tel.speedMph, 2);

  json += ",\"packVoltage\":";
  json += String(tel.voltage, 1);

  json += ",\"packCurrent\":";
  json += String(tel.current, 2);

  json += ",\"packSoc\":";
  json += String(tel.soc);

  json += ",\"packPowerWatts\":";
  json += String(tel.power, 1);

  json += ",\"motorTempC\":";
  json += String(tel.motorTemp, 1);

  json += ",\"controllerTempC\":";
  json += String(tel.ctrlTemp, 1);

  json += ",\"motorTempF\":";
  json += String(cToF(tel.motorTemp), 1);

  json += ",\"controllerTempF\":";
  json += String(cToF(tel.ctrlTemp), 1);

  json += ",\"motorRpm\":";
  json += String(tel.rpm, 1);

  json += ",\"rpm\":";
  json += String(tel.rpm, 1);

  json += ",\"throttlePercent\":";
  json += String(tel.throttlePct, 1);

  json += ",\"throttleVoltage\":";
  json += String(tel.throttleVoltage, 2);

  json += ",\"phaseA\":";
  json += String(tel.phaseA, 2);

  json += ",\"phaseC\":";
  json += String(tel.phaseC, 2);

  json += ",\"modulation\":";
  json += String(tel.modulation, 1);

  json += ",\"gear\":";
  json += String(tel.gear);

  json += ",\"controllerSerial\":\"";
  json += tel.controllerSerial;
  json += "\"";

  json += ",\"bleConnected\":";
  json += connected ? "true" : "false";

  json += ",\"telemetryFresh\":";
  json += telemetryFresh() ? "true" : "false";

  json += ",\"connectionStatus\":\"";
  json += connectionStatus();
  json += "\"";

  json += ",\"packetRateHz\":";
  json += String(tel.packetRateHz, 1);

  json += ",\"lastPacketAgeMs\":";
  json += String(lastPacketAgeMs());

  json += ",\"lastCloudStatus\":";
  json += String(tel.lastCloudStatus);

  json += "}";

  return json;
}

String telemetryJson() {
  String json = "{";
  json += "\"node\":\"vehicle\"";
  json += ",\"payload\":";
  json += payloadJsonOnly();
  json += "}";
  return json;
}

// ===================== DISPLAY JSON PARSING =====================

int jsonKeyIndex(const String& json, const char* key) {
  String quoted = "\"";
  quoted += key;
  quoted += "\"";
  return json.indexOf(quoted);
}

bool jsonFieldIsNull(const String& json, const char* key) {
  int keyPos = jsonKeyIndex(json, key);
  if (keyPos < 0) return false;

  int colon = json.indexOf(':', keyPos);
  if (colon < 0) return false;

  int start = colon + 1;
  while (start < json.length() && isspace((unsigned char)json[start])) start++;

  return json.substring(start, start + 4) == "null";
}

bool extractJsonNumber(const String& json, const char* key, float& value) {
  int keyPos = jsonKeyIndex(json, key);
  if (keyPos < 0) return false;

  int colon = json.indexOf(':', keyPos);
  if (colon < 0) return false;

  int start = colon + 1;
  while (start < json.length() && isspace((unsigned char)json[start])) start++;
  if (json.substring(start, start + 4) == "null") return false;

  int end = start;
  while (end < json.length()) {
    char c = json[end];
    if ((c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E') {
      end++;
    } else {
      break;
    }
  }

  if (end <= start) return false;

  String token = json.substring(start, end);
  value = token.toFloat();
  return true;
}

bool extractJsonString(const String& json, const char* key, String& value) {
  int keyPos = jsonKeyIndex(json, key);
  if (keyPos < 0) return false;

  int colon = json.indexOf(':', keyPos);
  if (colon < 0) return false;

  int start = colon + 1;
  while (start < json.length() && isspace((unsigned char)json[start])) start++;
  if (start >= json.length() || json[start] != '"') return false;

  start++;
  String out = "";
  bool escaping = false;

  for (int i = start; i < json.length(); i++) {
    char c = json[i];

    if (escaping) {
      out += c;
      escaping = false;
      continue;
    }

    if (c == '\\') {
      escaping = true;
      continue;
    }

    if (c == '"') {
      value = out;
      return true;
    }

    out += c;
  }

  return false;
}

void applyDisplayJson(const String& json) {
  float numberValue = 0.0;
  String stringValue = "";

  if (extractJsonNumber(json, "soc", numberValue)) {
    driverDisplay.soc = constrain((int)round(numberValue), 0, 100);
  } else if (jsonFieldIsNull(json, "soc")) {
    driverDisplay.soc = -1;
  }

  if (extractJsonNumber(json, "whPerMile", numberValue)) {
    driverDisplay.whPerMile = numberValue;
  } else if (jsonFieldIsNull(json, "whPerMile")) {
    driverDisplay.whPerMile = NAN;
  }

  if (extractJsonNumber(json, "checkpointDistanceMiles", numberValue)) {
    driverDisplay.checkpointDistanceMiles = numberValue;
  } else if (jsonFieldIsNull(json, "checkpointDistanceMiles")) {
    driverDisplay.checkpointDistanceMiles = NAN;
  }

  if (extractJsonNumber(json, "targetSpeedMph", numberValue)) {
    driverDisplay.targetSpeedMph = numberValue;
  }

  if (extractJsonString(json, "arrival", stringValue)) {
    driverDisplay.arrival = stringValue;
  }

  if (extractJsonString(json, "status", stringValue)) {
    driverDisplay.status = stringValue;
  }
}

// ===================== LOCAL HTTP =====================

void handleRoot() {
  server.send(200, "text/plain", "RX2 TFT FarDriver BLE Telemetry Node\nUse /telemetry or /ingest-body");
}

void handleTelemetry() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", payloadJsonOnly());
}

void handleIngestBody() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", telemetryJson());
}

// ===================== WEB DASHBOARD THEME COLORS =====================

#undef RX2_MAGENTA

#define RX2_BG          0x0000   // black
#define RX2_PANEL       0x1004   // very dark maroon
#define RX2_PANEL_2     0x1806
#define RX2_BORDER      0x50AB   // muted magenta border
#define RX2_MAGENTA     0xF81F
#define RX2_PINK        0xF81F
#define RX2_WHITE       0xFFFF
#define RX2_MUTED       0xBDF7
#define RX2_GREEN       0x07E0
#define RX2_YELLOW      0xFFE0
#define RX2_ORANGE      0xFD20
#define RX2_RED         0xF800
#define RX2_BLUE        0x04FF

// ===================== TFT DRAWING =====================

void clearValueArea(int x, int y, int w, int h) {
  gfx->fillRect(x, y, w, h, RX2_PANEL);
}

int approximateTextWidth(const String& text, int textSize) {
  return text.length() * 6 * textSize;
}

void drawPanel(int x, int y, int w, int h, const char* label) {
  gfx->fillRoundRect(x, y, w, h, 8, RX2_PANEL);
  gfx->drawRoundRect(x, y, w, h, 8, RX2_BORDER);

  gfx->setTextColor(RX2_WHITE);
  gfx->setTextSize(2);
  gfx->setCursor(x + 14, y + 12);
  gfx->print(label);
}

void drawBatteryIcon(int x, int y, int pct) {
  uint16_t color = pct >= 20 ? RX2_GREEN : RX2_RED;

  gfx->drawRoundRect(x, y + 6, 38, 50, 5, RX2_WHITE);
  gfx->fillRoundRect(x + 10, y, 18, 8, 3, RX2_WHITE);
  gfx->drawRect(x + 5, y + 12, 28, 38, RX2_WHITE);

  int bars = pct < 0 ? 0 : constrain((pct + 19) / 20, 0, 5);
  for (int i = 0; i < 5; i++) {
    uint16_t fillColor = i < bars ? color : RX2_PANEL_2;
    gfx->fillRect(x + 8, y + 44 - (i * 7), 22, 5, fillColor);
  }
}

void drawGaugeIcon(int x, int y) {
  gfx->drawCircle(x, y, 32, RX2_BLUE);
  gfx->drawCircle(x, y, 31, RX2_BLUE);
  gfx->fillRect(x - 35, y, 70, 31, RX2_PANEL);
  gfx->drawLine(x, y, x + 24, y - 20, RX2_BLUE);
  gfx->fillCircle(x, y, 6, RX2_BLUE);
  gfx->drawLine(x - 26, y - 6, x - 18, y - 8, RX2_BLUE);
  gfx->drawLine(x - 18, y - 22, x - 13, y - 15, RX2_BLUE);
  gfx->drawLine(x, y - 31, x, y - 23, RX2_BLUE);
  gfx->drawLine(x + 18, y - 22, x + 13, y - 15, RX2_BLUE);
  gfx->drawLine(x + 26, y - 6, x + 18, y - 8, RX2_BLUE);
}

void drawPinIcon(int x, int y) {
  gfx->fillCircle(x, y, 16, RX2_ORANGE);
  gfx->fillTriangle(x - 10, y + 10, x + 10, y + 10, x, y + 34, RX2_ORANGE);
  gfx->fillCircle(x, y, 6, RX2_PANEL);
  gfx->drawCircle(x - 38, y + 40, 7, RX2_ORANGE);
  gfx->drawLine(x - 32, y + 35, x - 15, y + 35, RX2_ORANGE);
  gfx->drawLine(x - 48, y + 27, x - 25, y + 27, RX2_ORANGE);
  gfx->drawLine(x - 58, y + 35, x - 45, y + 35, RX2_ORANGE);
}

void drawClockIcon(int x, int y) {
  gfx->drawCircle(x, y, 28, RX2_YELLOW);
  gfx->drawCircle(x, y, 27, RX2_YELLOW);
  gfx->fillCircle(x, y, 4, RX2_YELLOW);
  gfx->drawLine(x, y, x, y - 18, RX2_YELLOW);
  gfx->drawLine(x, y, x + 16, y + 10, RX2_YELLOW);
}

void drawFlagIcon(int x, int y, uint16_t color) {
  gfx->drawLine(x, y + 2, x, y + 42, color);
  gfx->fillTriangle(x + 2, y + 4, x + 50, y + 13, x + 2, y + 23, color);
  gfx->fillTriangle(x + 50, y + 13, x + 50, y + 31, x + 2, y + 23, color);
  gfx->fillRect(x + 12, y + 8, 10, 9, RX2_PANEL);
  gfx->fillRect(x + 34, y + 15, 10, 9, RX2_PANEL);
}

void drawWifiIcon(int x, int y, uint16_t color) {
  gfx->drawLine(x - 18, y - 10, x - 8, y - 18, color);
  gfx->drawLine(x - 8, y - 18, x + 8, y - 18, color);
  gfx->drawLine(x + 8, y - 18, x + 18, y - 10, color);
  gfx->drawLine(x - 12, y - 2, x - 5, y - 8, color);
  gfx->drawLine(x - 5, y - 8, x + 5, y - 8, color);
  gfx->drawLine(x + 5, y - 8, x + 12, y - 2, color);
  gfx->fillCircle(x, y + 7, 4, color);
}

void drawBleIcon(int x, int y, uint16_t color) {
  gfx->drawLine(x, y - 20, x, y + 20, color);
  gfx->drawLine(x, y - 20, x + 16, y - 6, color);
  gfx->drawLine(x + 16, y - 6, x, y + 6, color);
  gfx->drawLine(x, y + 6, x + 16, y + 20, color);
  gfx->drawLine(x + 16, y + 20, x, y + 32, color);
  gfx->drawLine(x, y - 2, x - 15, y - 14, color);
  gfx->drawLine(x, y + 6, x - 15, y + 18, color);
}

void drawCloudIcon(int x, int y, uint16_t color) {
  gfx->drawCircle(x - 16, y + 4, 13, color);
  gfx->drawCircle(x, y - 4, 17, color);
  gfx->drawCircle(x + 18, y + 5, 12, color);
  gfx->drawLine(x - 28, y + 17, x + 30, y + 17, color);
  gfx->fillTriangle(x, y + 3, x - 10, y + 15, x + 10, y + 15, color);
  gfx->drawLine(x, y + 3, x, y + 23, color);
}

void drawSmallWifiIcon(int x, int y, uint16_t color) {
  gfx->drawLine(x - 10, y - 5, x - 4, y - 10, color);
  gfx->drawLine(x - 4, y - 10, x + 4, y - 10, color);
  gfx->drawLine(x + 4, y - 10, x + 10, y - 5, color);
  gfx->drawLine(x - 6, y + 1, x - 2, y - 3, color);
  gfx->drawLine(x - 2, y - 3, x + 2, y - 3, color);
  gfx->drawLine(x + 2, y - 3, x + 6, y + 1, color);
  gfx->fillCircle(x, y + 6, 2, color);
}

void drawSmallBleIcon(int x, int y, uint16_t color) {
  gfx->drawLine(x, y - 11, x, y + 11, color);
  gfx->drawLine(x, y - 11, x + 8, y - 4, color);
  gfx->drawLine(x + 8, y - 4, x, y + 3, color);
  gfx->drawLine(x, y + 3, x + 8, y + 10, color);
  gfx->drawLine(x + 8, y + 10, x, y + 17, color);
  gfx->drawLine(x, y - 1, x - 8, y - 7, color);
  gfx->drawLine(x, y + 3, x - 8, y + 9, color);
}

void drawSmallCloudIcon(int x, int y, uint16_t color) {
  gfx->drawCircle(x - 8, y + 2, 6, color);
  gfx->drawCircle(x, y - 2, 8, color);
  gfx->drawCircle(x + 9, y + 3, 6, color);
  gfx->drawLine(x - 14, y + 9, x + 16, y + 9, color);
  gfx->drawLine(x, y - 1, x, y + 12, color);
  gfx->fillTriangle(x, y - 1, x - 5, y + 6, x + 5, y + 6, color);
}

void drawMiniStatus(int x, int y, int w, const char* label, bool ok, char iconType) {
  uint16_t color = ok ? RX2_GREEN : RX2_RED;
  String statusText = ok ? "OK" : "BAD";

  gfx->fillRect(x, y + 1, w, 28, RX2_PANEL_2);
  gfx->setTextSize(1);
  gfx->setTextColor(RX2_WHITE);
  gfx->setCursor(x + 10, y + 4);
  gfx->print(label);

  if (iconType == 'w') drawSmallWifiIcon(x + 18, y + 20, color);
  if (iconType == 'b') drawSmallBleIcon(x + 18, y + 16, color);
  if (iconType == 'c') drawSmallCloudIcon(x + 19, y + 19, color);

  gfx->setTextSize(2);
  gfx->setTextColor(color);
  gfx->setCursor(x + 43, y + 14);
  gfx->print(statusText);
}

void drawHttpStatus(int x, int y, int w, int statusCode, bool ok) {
  uint16_t color = ok ? RX2_GREEN : RX2_RED;

  gfx->fillRect(x, y + 1, w, 28, RX2_PANEL_2);
  gfx->setTextSize(1);
  gfx->setTextColor(RX2_WHITE);
  gfx->setCursor(x + 9, y + 5);
  gfx->print("HTTP");

  gfx->setTextSize(2);
  gfx->setTextColor(color);
  gfx->setCursor(x + 42, y + 14);
  gfx->print(statusCode);
}

uint16_t statusColor(const String& status) {
  if (status == "EXCELLENT") return RX2_GREEN;
  if (status == "ON TARGET") return RX2_GREEN;
  if (status == "WATCH EFF") return RX2_YELLOW;
  if (status == "SLOW DOWN") return RX2_RED;
  return RX2_WHITE;
}

void drawStaticDashboard() {
  gfx->fillScreen(RX2_BG);

  gfx->drawRect(2, 2, 476, 316, RX2_BORDER);
  gfx->drawRoundRect(8, 8, 464, 304, 8, RX2_PANEL_2);

  gfx->drawFastHLine(32, 27, 104, RX2_MAGENTA);
  gfx->drawFastHLine(344, 27, 104, RX2_MAGENTA);
  gfx->setTextSize(3);
  gfx->setCursor(91, 17);
  gfx->setTextColor(RX2_MAGENTA);
  gfx->print("RX2");
  gfx->setTextColor(RX2_WHITE);
  gfx->print(" RACE DASH");

  drawPanel(14, 56, 222, 78, "SOC");
  drawPanel(244, 56, 222, 78, "Wh/mi");
  drawPanel(14, 140, 222, 78, "CHECKPOINT");
  drawPanel(244, 140, 222, 78, "ARRIVAL");
  drawPanel(14, 224, 452, 50, "STATUS");

  gfx->fillRoundRect(14, 280, 452, 32, 8, RX2_PANEL_2);
  gfx->drawRoundRect(14, 280, 452, 32, 8, RX2_BORDER);
  gfx->drawFastVLine(126, 286, 20, RX2_BORDER);
  gfx->drawFastVLine(238, 286, 20, RX2_BORDER);
  gfx->drawFastVLine(350, 286, 20, RX2_BORDER);

  drawBatteryIcon(184, 72, driverDisplay.soc);
  drawGaugeIcon(423, 99);
  drawPinIcon(198, 163);
  drawClockIcon(424, 179);

  dashboardDrawn = true;
}

void updateDashboardValues() {
  bool wifiOK = WiFi.status() == WL_CONNECTED;
  bool bleOK = connected;
  bool cloudOK = displayCloudOK();

  drawBatteryIcon(184, 72, driverDisplay.soc);
  drawGaugeIcon(423, 99);
  drawPinIcon(198, 163);
  drawClockIcon(424, 179);

  clearValueArea(30, 87, 140, 38);
  gfx->setTextSize(5);
  gfx->setTextColor(RX2_GREEN);
  gfx->setCursor(30, 85);
  if (driverDisplay.soc >= 0) {
    gfx->print(driverDisplay.soc);
    gfx->print("%");
  } else {
    gfx->print("--");
  }

  clearValueArea(260, 87, 130, 38);
  gfx->setTextSize(5);
  gfx->setTextColor(RX2_BLUE);
  gfx->setCursor(260, 85);
  if (isnan(driverDisplay.whPerMile)) {
    gfx->print("--");
  } else {
    gfx->print(driverDisplay.whPerMile, 0);
  }
  gfx->setTextSize(2);
  gfx->setCursor(370, 103);
  gfx->print("Wh/mi");

  clearValueArea(30, 169, 150, 38);
  gfx->setTextSize(5);
  gfx->setTextColor(RX2_ORANGE);
  gfx->setCursor(30, 166);
  if (isnan(driverDisplay.checkpointDistanceMiles)) {
    gfx->print("--");
  } else {
    gfx->print(driverDisplay.checkpointDistanceMiles, 1);
  }
  gfx->setTextSize(2);
  gfx->setCursor(166, 186);
  gfx->print("mi");

  clearValueArea(260, 169, 140, 38);
  gfx->setTextSize(4);
  gfx->setTextColor(RX2_YELLOW);
  gfx->setCursor(260, 172);
  gfx->print(driverDisplay.arrival);

  uint16_t statusTextColor = statusColor(driverDisplay.status);
  gfx->fillRect(88, 238, 295, 32, RX2_PANEL);
  gfx->setTextSize(4);
  gfx->setTextColor(statusTextColor);
  int statusX = 240 - (approximateTextWidth(driverDisplay.status, 4) / 2);
  gfx->setCursor(constrain(statusX, 95, 170), 239);
  gfx->print(driverDisplay.status);
  gfx->fillRect(400, 229, 56, 46, RX2_PANEL);
  drawFlagIcon(405, 229, statusTextColor);

  drawMiniStatus(18, 282, 108, "WiFi", wifiOK, 'w');
  drawMiniStatus(130, 282, 108, "BLE", bleOK, 'b');
  drawMiniStatus(242, 282, 108, "CLOUD", cloudOK, 'c');
  drawHttpStatus(354, 282, 108, driverDisplay.lastDisplayHttpStatus, cloudOK);
}

void drawDashboard() {
  if (!dashboardDrawn) {
    drawStaticDashboard();
  }
  updateDashboardValues();
}

// ===================== CLOUD POST =====================

void postTelemetryToCloud() {
  if (WiFi.status() != WL_CONNECTED) {
    tel.lastCloudStatus = -1;
    tel.lastCloudResponse = "wifi_disconnected";
    return;
  }

  if (!tokenConfigured()) {
    tel.lastCloudStatus = -2;
    tel.lastCloudResponse = "missing_token";
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(HTTPS_TIMEOUT_MS / 1000);

  HTTPClient http;

  if (!http.begin(client, INGEST_URL)) {
    tel.lastCloudStatus = -3;
    tel.lastCloudResponse = "http_begin_failed";
    return;
  }

  http.setTimeout(HTTPS_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");

  String auth = "Bearer ";
  auth += TELEMETRY_TOKEN;
  http.addHeader("Authorization", auth);

  String body = telemetryJson();

  int code = http.POST(body);
  String response = http.getString();

  tel.lastCloudStatus = code;
  tel.lastCloudResponse = response;
  tel.lastCloudPostMs = millis();

  Serial.print("Cloud POST status: ");
  Serial.print(code);
  Serial.print(" response: ");
  Serial.println(response);

  http.end();
}

// ===================== DISPLAY PULL =====================

void fetchDisplayFromCloud() {
  if (WiFi.status() != WL_CONNECTED) {
    driverDisplay.lastDisplayHttpStatus = -1;
    driverDisplay.lastDisplayResponse = "wifi_disconnected";
    return;
  }

  if (!tokenConfigured()) {
    driverDisplay.lastDisplayHttpStatus = -2;
    driverDisplay.lastDisplayResponse = "missing_token";
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(HTTPS_TIMEOUT_MS / 1000);

  HTTPClient http;

  if (!http.begin(client, DISPLAY_URL)) {
    driverDisplay.lastDisplayHttpStatus = -3;
    driverDisplay.lastDisplayResponse = "http_begin_failed";
    return;
  }

  http.setTimeout(HTTPS_TIMEOUT_MS);
  String auth = "Bearer ";
  auth += TELEMETRY_TOKEN;
  http.addHeader("Authorization", auth);

  int code = http.GET();
  String response = http.getString();

  driverDisplay.lastDisplayHttpStatus = code;
  driverDisplay.lastDisplayResponse = response;

  if (code >= 200 && code < 300) {
    applyDisplayJson(response);
    driverDisplay.lastDisplayFetchMs = millis();
  }

  Serial.print("Display GET status: ");
  Serial.print(code);
  Serial.print(" response: ");
  Serial.println(response);

  http.end();
}

// ===================== BLE CALLBACKS =====================

class AdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice device) override {
    String name = device.getName().c_str();

    Serial.print("Found: ");
    Serial.print(name);
    Serial.print(" RSSI: ");
    Serial.println(device.getRSSI());

    if (name.indexOf(TARGET_NAME_1) >= 0 || name.indexOf(TARGET_NAME_2) >= 0) {
      Serial.println("Target found.");
      targetDevice = new BLEAdvertisedDevice(device);
      doConnect = true;
      BLEDevice::getScan()->stop();
    }
  }
};

static void notifyCallback(
  BLERemoteCharacteristic* characteristic,
  uint8_t* data,
  size_t length,
  bool isNotify
) {
  tel.packetCount++;
  tel.lastPacketMs = millis();

  if (length < 16) return;
  if (data[0] != 0xAA) return;

  uint8_t frameId = data[1];

  if (frameId == 0xA1) {
    tel.serialPart1 = asciiFromBytes(data, 4, 10);
    tel.controllerSerial = tel.serialPart1 + tel.serialPart2;
    return;
  }

  if (frameId == 0xA2) {
    tel.serialPart2 = asciiFromBytes(data, 2, 10);
    tel.controllerSerial = tel.serialPart1 + tel.serialPart2;
    return;
  }

  if (frameId == 0x99) {
    uint16_t raw = u16le(data, 2);
    tel.throttleVoltage = raw * 0.01;
    return;
  }

  if (isCodeE2Frame(frameId)) {
    uint16_t rpmRaw = u16le(data, 8);

    tel.rpm = (float)rpmRaw;
    tel.modulation = ((float)data[6]) * 100.0 / 128.0;
    tel.gear = data[2] & 0x03;

    if (speedCoeffValid && speedDenom > 0) {
      tel.speedMph = ((float)rpmRaw) * 0.0037699113633689247 * speedCoeff / (float)speedDenom;
    }

    return;
  }

  if (isCodeE8Frame(frameId)) {
    uint16_t voltageRaw = u16le(data, 2);
    int16_t currentRaw = s16le(data, 6);
    uint16_t throttleRaw = u16le(data, 12);

    tel.voltage = voltageRaw / 10.0;
    tel.current = currentRaw / 4.0;
    tel.power = tel.voltage * tel.current;

    tel.throttleRaw = throttleRaw;
    tel.throttlePct = throttleRaw * 100.0 / 480.0;

    return;
  }

  if (isCodeEEFrame(frameId)) {
    uint32_t phaseARaw = u24be(data, 6);
    uint32_t phaseCRaw = u24be(data, 9);

    tel.phaseA = sqrt((float)phaseARaw) * 1.953125;
    tel.phaseC = sqrt((float)phaseCRaw) * 1.953125;

    return;
  }

  if (frameId == 0xAF) {
    uint8_t b6 = data[6];
    uint8_t b7 = data[7];
    uint8_t b9 = data[9];
    uint16_t denom = u16le(data, 10);

    speedCoeff = ((float)b7 * 1270.0) + ((float)b9 * (float)b6);
    speedDenom = denom;
    speedCoeffValid = speedDenom > 0;

    return;
  }

  if (frameId == 0xB3) {
    tel.ctrlTemp = (float)s16le(data, 12);
    return;
  }

  if (frameId == 0xB5) {
    tel.motorTemp = (float)s16le(data, 2);
    tel.soc = data[5];
    return;
  }
}

// ===================== BLE CONNECT =====================

bool connectAndSubscribe() {
  BLEClient* client = BLEDevice::createClient();

  Serial.println("Connecting to FarDriver BLE...");
  if (!client->connect(targetDevice)) {
    Serial.println("BLE connect failed.");
    connected = false;
    return false;
  }

  connected = true;
  Serial.println("BLE connected.");

  std::map<std::string, BLERemoteService*>* services = client->getServices();

  for (auto const& servicePair : *services) {
    BLERemoteService* service = servicePair.second;
    std::map<std::string, BLERemoteCharacteristic*>* chars = service->getCharacteristics();

    for (auto const& charPair : *chars) {
      BLERemoteCharacteristic* ch = charPair.second;
      String uuid = ch->getUUID().toString().c_str();

      if (uuid.equalsIgnoreCase(FARDIVER_NOTIFY_UUID)) {
        Serial.println("Found FFEC notify characteristic.");
        ch->registerForNotify(notifyCallback);
        Serial.println("Subscribed.");
        return true;
      }
    }
  }

  Serial.println("FFEC notify characteristic not found.");
  return false;
}

// ===================== WIFI =====================

void connectWifi() {
  Serial.print("Connecting WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi failed. Continuing BLE-only.");
  }
}

// ===================== SETUP / LOOP =====================

void setup() {
  Serial.begin(115200);
  delay(250);

  gfx->begin();
  gfx->setRotation(1);

  Serial.println("RX2 ESP32 FarDriver BLE Cloud TFT Driver Dashboard v1.0");

  drawStaticDashboard();
  updateDashboardValues();

  connectWifi();
  updateDashboardValues();

  server.on("/", handleRoot);
  server.on("/telemetry", handleTelemetry);
  server.on("/ingest-body", handleIngestBody);
  server.begin();

  Serial.println("HTTP server started.");

  BLEDevice::init("");

  BLEScan* scan = BLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(new AdvertisedDeviceCallbacks());
  scan->setActiveScan(true);
  scan->setInterval(100);
  scan->setWindow(99);

  Serial.println("Scanning for FarDriver BLE...");
  scan->start(10, false);

  delay(1000);
  updateDashboardValues();
}

void loop() {
  server.handleClient();

  if (doConnect && !connected) {
    doConnect = false;
    connectAndSubscribe();
  }

  static unsigned long lastPrint = 0;
  if (millis() - lastPrint >= 1000) {
    lastPrint = millis();

    tel.packetRateHz = tel.packetCount - lastPacketCount;
    lastPacketCount = tel.packetCount;

    Serial.println(payloadJsonOnly());
  }

  static unsigned long lastCloudPost = 0;
  if (millis() - lastCloudPost >= CLOUD_POST_INTERVAL_MS) {
    lastCloudPost = millis();

    if (telemetryFresh()) {
      postTelemetryToCloud();
    }
  }

  static unsigned long lastDisplayPull = millis();
  if (millis() - lastDisplayPull >= DISPLAY_PULL_INTERVAL_MS) {
    lastDisplayPull = millis();
    fetchDisplayFromCloud();
  }

  if (millis() - lastScreenUpdate >= 1000) {
    lastScreenUpdate = millis();
    updateDashboardValues();
  }
}
