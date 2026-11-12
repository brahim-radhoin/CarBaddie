import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  View,
  Alert,
  Platform,
  ActivityIndicator,
  TextInput,
  Switch,
  Image,
} from "react-native";
import { useTheme } from "expo-router";
import { Text } from "@/components/Themed";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { exportBackupData, analyzeBackup, executeImport } from "@/src/db/backup";
import { getDatabase } from "@/src/db/schema";
import { seedDefaultServiceTypes } from "@/src/db/seed";
import {
  useVehicles,
  useServiceTypes,
} from "@/src/hooks/useDatabase";
import {
  getGoogleDriveStatus,
  setGoogleDriveToken,
  disconnectGoogleDrive,
  signInWithGoogle,
  setAutoSyncEnabled,
  performAutoSync,
  type GoogleDriveStatus,
} from "@/src/services/googleDrive";
import * as repo from "@/src/db/repository";
import { useQueryClient } from "@tanstack/react-query";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();

  // Queries for garage stats
  const { data: vehicles = [] } = useVehicles();
  const { data: serviceTypes = [] } = useServiceTypes();
  const totalLogsCount = vehicles.reduce((acc, v) => acc + (v.maintenance_logs?.length ?? 0), 0);

  // Loading states
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  // Google Drive state
  const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus>({ isConnected: false, autoSyncEnabled: true });
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customClientIdInput, setCustomClientIdInput] = useState("");
  const [manualTokenInput, setManualTokenInput] = useState("");

  // App preferences
  const [odometerUnit, setOdometerUnit] = useState<"km" | "mi">("km");
  const [currencySymbol, setCurrencySymbol] = useState<string>("$");

  const loadPreferences = async () => {
    try {
      const unit = await repo.getSetting("pref_odometer_unit");
      if (unit === "mi" || unit === "km") setOdometerUnit(unit);
      const curr = await repo.getSetting("pref_currency_symbol");
      if (curr) setCurrencySymbol(curr);
    } catch {
      // Ignore
    }
  };

  const handleSetUnit = async (unit: "km" | "mi") => {
    setOdometerUnit(unit);
    await repo.setSetting("pref_odometer_unit", unit);
  };

  const handleSetCurrency = async (curr: string) => {
    setCurrencySymbol(curr);
    await repo.setSetting("pref_currency_symbol", curr);
  };

  const refreshDriveStatus = async () => {
    try {
      const status = await getGoogleDriveStatus();
      setDriveStatus(status);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    refreshDriveStatus();
    loadPreferences();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      const res = await signInWithGoogle(customClientIdInput.trim() || undefined);
      if (res.success) {
        await refreshDriveStatus();
        await performAutoSync(() => queryClient.invalidateQueries());
        await refreshDriveStatus();
        Alert.alert("Connected", `Signed in as ${res.email || "Google Account"}. Automatic cloud sync is now active!`);
      } else if (res.error) {
        Alert.alert("Sign In", res.error);
      }
    } catch (e: any) {
      Alert.alert("Sign In Error", e.message || "Failed to sign in with Google.");
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      setIsSyncing(true);
      const res = await performAutoSync(() => queryClient.invalidateQueries());
      await refreshDriveStatus();
      if (res.action === "pulled") {
        Alert.alert("Synced", "Latest records downloaded from Google Drive!");
      } else if (res.action === "pushed") {
        Alert.alert("Synced", "Local records saved to Google Drive!");
      } else {
        Alert.alert("In Sync", "Your garage database is already up to date with Google Drive.");
      }
    } catch (e: any) {
      Alert.alert("Sync Error", e.message || "Failed to sync with Google Drive.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleAutoSync = async (value: boolean) => {
    await setAutoSyncEnabled(value);
    setDriveStatus((p) => ({ ...p, autoSyncEnabled: value }));
  };

  const handleDisconnectDrive = () => {
    Alert.alert("Sign Out of Google Drive", "Cloud backups will pause until you sign back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await disconnectGoogleDrive();
          await refreshDriveStatus();
        },
      },
    ]);
  };

  const handleManualTokenSave = async () => {
    if (!manualTokenInput.trim()) return;
    try {
      await setGoogleDriveToken(manualTokenInput.trim());
      await refreshDriveStatus();
      setManualTokenInput("");
      Alert.alert("Connected", "Access token saved successfully.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save token.");
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const backup = await exportBackupData({ include_maintenance_logs: true });
      const json = JSON.stringify(backup, null, 2);
      const timestamp = new Date().toISOString().slice(0, 10);
      const fileName = `carbaddie_backup_${timestamp}.json`;

      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Alert.alert("Success", "Backup downloaded successfully!");
      } else {
        const fileUri = FileSystem.cacheDirectory + fileName;
        await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/json",
            dialogTitle: "Save CarBaddie Backup",
          });
        }
        Alert.alert("Success", "Backup exported successfully!");
      }
    } catch (e: any) {
      Alert.alert("Export Failed", e.message ?? "Unknown error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    try {
      setIsImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", ".json", "text/json", "*/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      let content = "";

      if (asset.file) {
        content = await asset.file.text();
      } else if (Platform.OS === "web") {
        if (asset.base64) {
          try {
            content = atob(asset.base64.split(",").pop() || "");
          } catch {
            const res = await fetch(asset.uri);
            content = await res.text();
          }
        } else {
          const res = await fetch(asset.uri);
          content = await res.text();
        }
      } else {
        try {
          content = await FileSystem.readAsStringAsync(asset.uri);
        } catch {
          const res = await fetch(asset.uri);
          content = await res.text();
        }
      }

      if (!content || !content.trim()) throw new Error("File is empty.");
      const backupData = JSON.parse(content);
      await processRestorePlan(backupData);
    } catch (e: any) {
      Alert.alert("Import Failed", e.message ?? "Unknown error");
    } finally {
      setIsImporting(false);
    }
  };

  const processRestorePlan = async (backupData: any) => {
    if (!backupData.metadata || !backupData.vehicles || !backupData.service_types) {
      throw new Error("Invalid backup file: missing metadata, vehicles, or service_types.");
    }

    const analysis = await analyzeBackup(backupData);
    const newCount = analysis.new_vehicles.length;
    const conflictCount = analysis.conflicting_vehicles.length;

    let message = "";
    if (newCount > 0) message += `• ${newCount} new vehicle(s) will be added\n`;
    if (conflictCount > 0) message += `• ${conflictCount} existing vehicle(s) will be replaced\n`;

    const performRestore = async () => {
      try {
        await executeImport(backupData, {
          vehicles_to_add: analysis.new_vehicles.map((v) => v.id_in_backup),
          conflict_resolutions: analysis.conflicting_vehicles.map((c) => ({
            vin: c.vin,
            action: "replace",
          })),
        });
        queryClient.invalidateQueries();
        Alert.alert("Success", "Backup restored successfully!");
      } catch (err: any) {
        Alert.alert("Import Failed", err.message ?? "Unknown error");
      }
    };

    Alert.alert(
      "Restore Backup",
      `${message || "No vehicle conflicts found."}\nProceed with restoring records?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Restore Data", style: "default", onPress: performRestore },
      ]
    );
  };

  const handleSeedDefaults = async () => {
    try {
      setIsSeeding(true);
      const db = await getDatabase();
      const count = await seedDefaultServiceTypes(db, true);
      queryClient.invalidateQueries();
      Alert.alert("Success", `Loaded ${count} factory automotive service types.`);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to load service types.");
    } finally {
      setIsSeeding(false);
    }
  };

  const handleWipeDatabase = () => {
    Alert.alert(
      "Wipe Garage Database",
      "Are you sure you want to delete ALL vehicles and maintenance logs? This action is permanent and cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Wipe Everything",
          style: "destructive",
          onPress: async () => {
            try {
              setIsWiping(true);
              const db = await getDatabase();
              await db.execAsync(`
                DELETE FROM maintenance_logs;
                DELETE FROM vehicles;
                DELETE FROM vehicle_service_interval_overrides;
              `);
              queryClient.invalidateQueries();
              Alert.alert("Wiped", "All garage records have been cleared.");
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to wipe database.");
            } finally {
              setIsWiping(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* App Header / Brand Badge */}
      <View style={styles.brandHeader}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={styles.brandLogo}
        />
        <View style={styles.brandMeta}>
          <Text style={[styles.brandTitle, { color: colors.text }]}>CarBaddie</Text>
          <Text style={[styles.brandSubtitle, { color: (colors.text as string) + "88" }]}>
            Automotive Fleet & Maintenance Telemetry
          </Text>
        </View>
      </View>

      {/* SECTION 1: CLOUD SYNC */}
      <View style={styles.sectionGroup}>
        <Text style={[styles.groupHeader, { color: colors.primary }]}>CLOUD SYNCHRONIZATION</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Google Drive</Text>
              <Text style={[styles.cardDesc, { color: (colors.text as string) + "88" }]}>
                Keeps your garage records seamlessly synchronized between phone and PC.
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: driveStatus.isConnected ? "#10b98120" : (colors.text as string) + "10",
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  { color: driveStatus.isConnected ? "#10b981" : (colors.text as string) + "77" },
                ]}
              >
                {driveStatus.isConnected ? "✓ Active" : "Off"}
              </Text>
            </View>
          </View>

          {driveStatus.isConnected ? (
            <View style={styles.connectedBox}>
              <View style={styles.accountRow}>
                <View style={styles.googleBadge}>
                  <Text style={styles.googleG}>G</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.accountEmail, { color: colors.text }]}>
                    {driveStatus.email || "Google Account"}
                  </Text>
                  <Text style={[styles.accountMeta, { color: (colors.text as string) + "77" }]}>
                    {driveStatus.lastBackupTime
                      ? `Last synced: ${new Date(driveStatus.lastBackupTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "Automatic background sync active"}
                  </Text>
                </View>
              </View>

              <View style={[styles.switchRow, { borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.switchTitle, { color: colors.text }]}>Automatic Sync</Text>
                  <Text style={[styles.switchDesc, { color: (colors.text as string) + "77" }]}>
                    Syncs changes automatically when you add logs or open the app.
                  </Text>
                </View>
                <Switch
                  value={driveStatus.autoSyncEnabled}
                  onValueChange={handleToggleAutoSync}
                  trackColor={{ false: "#333", true: colors.primary }}
                />
              </View>

              <View style={styles.cloudActionRow}>
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSyncNow}
                  disabled={isSyncing}
                  activeOpacity={0.8}
                >
                  {isSyncing ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryActionText}>Sync Now</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.ghostActionBtn} onPress={handleDisconnectDrive}>
                  <Text style={styles.ghostActionText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 8 }}>
              <TouchableOpacity
                style={styles.googleSignInBtn}
                onPress={handleGoogleSignIn}
                disabled={isSigningIn}
                activeOpacity={0.85}
              >
                {isSigningIn ? (
                  <ActivityIndicator color="#0f172a" size="small" />
                ) : (
                  <View style={styles.googleBtnInner}>
                    <View style={styles.googleBadge}>
                      <Text style={styles.googleG}>G</Text>
                    </View>
                    <Text style={styles.googleSignInText}>Sign in with Google</Text>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={[styles.googleSignInHint, { color: (colors.text as string) + "66" }]}>
                Sign in once to enable zero-click cloud backup to your personal Google Drive.
              </Text>

              {/* Collapsible Advanced Config */}
              <TouchableOpacity onPress={() => setShowAdvanced(!showAdvanced)} style={styles.advancedToggleBtn}>
                <Text style={{ color: (colors.text as string) + "66", fontSize: 11 }}>
                  {showAdvanced ? "▲ Hide Advanced Options" : "▼ Advanced Developer Options"}
                </Text>
              </TouchableOpacity>

              {showAdvanced && (
                <View style={[styles.advancedContainer, { borderColor: colors.border }]}>
                  <Text style={[styles.advancedLabel, { color: colors.text }]}>Custom Client ID (Optional)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                    value={customClientIdInput}
                    onChangeText={setCustomClientIdInput}
                    placeholder="Enter custom OAuth Client ID"
                    placeholderTextColor={(colors.text as string) + "44"}
                    autoCapitalize="none"
                  />

                  <Text style={[styles.advancedLabel, { color: colors.text, marginTop: 10 }]}>Direct Access Token Fallback</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                      value={manualTokenInput}
                      onChangeText={setManualTokenInput}
                      placeholder="ya29..."
                      placeholderTextColor={(colors.text as string) + "44"}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={[styles.saveTokenBtn, { backgroundColor: colors.primary }]}
                      onPress={handleManualTokenSave}
                    >
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      {/* SECTION 2: GARAGE TELEMETRY & PREFERENCES */}
      <View style={styles.sectionGroup}>
        <Text style={[styles.groupHeader, { color: colors.primary }]}>GARAGE PREFERENCES</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Stats Bar */}
          <View style={styles.kpiContainer}>
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiVal, { color: colors.text }]}>{vehicles.length}</Text>
              <Text style={[styles.kpiLbl, { color: (colors.text as string) + "77" }]}>Vehicles</Text>
            </View>
            <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiVal, { color: colors.text }]}>{totalLogsCount}</Text>
              <Text style={[styles.kpiLbl, { color: (colors.text as string) + "77" }]}>Service Logs</Text>
            </View>
            <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiVal, { color: colors.text }]}>{serviceTypes.length}</Text>
              <Text style={[styles.kpiLbl, { color: (colors.text as string) + "77" }]}>Categories</Text>
            </View>
          </View>

          {/* Unit Switcher */}
          <View style={[styles.prefRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.prefLabel, { color: colors.text }]}>Distance Units</Text>
              <Text style={[styles.prefDesc, { color: (colors.text as string) + "77" }]}>
                Odometer and interval measurements
              </Text>
            </View>
            <View style={[styles.pillSelector, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <TouchableOpacity
                style={[styles.pillOption, odometerUnit === "km" && { backgroundColor: colors.primary }]}
                onPress={() => handleSetUnit("km")}
              >
                <Text style={{ color: odometerUnit === "km" ? "#fff" : colors.text, fontSize: 12, fontWeight: "700" }}>
                  km
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pillOption, odometerUnit === "mi" && { backgroundColor: colors.primary }]}
                onPress={() => handleSetUnit("mi")}
              >
                <Text style={{ color: odometerUnit === "mi" ? "#fff" : colors.text, fontSize: 12, fontWeight: "700" }}>
                  miles
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Currency Switcher */}
          <View style={[styles.prefRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.prefLabel, { color: colors.text }]}>Currency Symbol</Text>
              <Text style={[styles.prefDesc, { color: (colors.text as string) + "77" }]}>
                Used on service receipts and cost calculations
              </Text>
            </View>
            <View style={[styles.pillSelector, { borderColor: colors.border, backgroundColor: colors.background }]}>
              {["$", "€", "£"].map((sym) => (
                <TouchableOpacity
                  key={sym}
                  style={[styles.pillOption, currencySymbol === sym && { backgroundColor: colors.primary }]}
                  onPress={() => handleSetCurrency(sym)}
                >
                  <Text style={{ color: currencySymbol === sym ? "#fff" : colors.text, fontSize: 13, fontWeight: "700" }}>
                    {sym}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* SECTION 3: DATA MANAGEMENT */}
      <View style={styles.sectionGroup}>
        <Text style={[styles.groupHeader, { color: colors.primary }]}>LOCAL DATA & BACKUP</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0 }]}>
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            onPress={handleExport}
            disabled={isExporting}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuRowTitle, { color: colors.text }]}>Export Offline Backup (JSON)</Text>
              <Text style={[styles.menuRowDesc, { color: (colors.text as string) + "77" }]}>
                Download or share your entire fleet database file
              </Text>
            </View>
            {isExporting ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={[styles.menuRowArrow, { color: (colors.text as string) + "44" }]}>›</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            onPress={handleImport}
            disabled={isImporting}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuRowTitle, { color: colors.text }]}>Import from Backup File</Text>
              <Text style={[styles.menuRowDesc, { color: (colors.text as string) + "77" }]}>
                Restore records from a CarBaddie backup JSON
              </Text>
            </View>
            {isImporting ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={[styles.menuRowArrow, { color: (colors.text as string) + "44" }]}>›</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuRow}
            onPress={handleSeedDefaults}
            disabled={isSeeding}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuRowTitle, { color: colors.text }]}>Reset Factory Service Categories</Text>
              <Text style={[styles.menuRowDesc, { color: (colors.text as string) + "77" }]}>
                Load 25 standard automotive service schedules & suggestions
              </Text>
            </View>
            {isSeeding ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={[styles.menuRowArrow, { color: (colors.text as string) + "44" }]}>›</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* SECTION 4: DANGER ZONE */}
      <View style={styles.sectionGroup}>
        <Text style={[styles.groupHeader, { color: "#ef4444" }]}>DANGER ZONE</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: "#ef444430" }]}>
          <View style={styles.wipeRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.wipeTitle, { color: "#ef4444" }]}>Wipe Garage Database</Text>
              <Text style={[styles.wipeDesc, { color: (colors.text as string) + "77" }]}>
                Permanently delete all vehicles, logs, and interval overrides on this device.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.wipeBtn, { backgroundColor: "#ef444415", borderColor: "#ef444440" }]}
              onPress={handleWipeDatabase}
              disabled={isWiping}
              activeOpacity={0.8}
            >
              {isWiping ? (
                <ActivityIndicator color="#ef4444" size="small" />
              ) : (
                <Text style={styles.wipeBtnText}>Wipe All</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Footer Info */}
      <View style={styles.footerInfo}>
        <Text style={[styles.footerText, { color: (colors.text as string) + "55" }]}>
          CarBaddie v1.0.0 • Offline SQLite Engine • Unslop Edition
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  brandLogo: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  brandMeta: { flex: 1 },
  brandTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionGroup: {
    marginBottom: 20,
  },
  groupHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 3,
  },
  cardDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  connectedBox: {
    marginTop: 8,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  googleBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#4285F4",
    alignItems: "center",
    justifyContent: "center",
  },
  googleG: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
  accountEmail: {
    fontSize: 14,
    fontWeight: "700",
  },
  accountMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  switchDesc: {
    fontSize: 11,
    marginTop: 2,
    maxWidth: 240,
  },
  cloudActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    alignItems: "center",
  },
  primaryActionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  ghostActionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  ghostActionText: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "600",
  },
  googleSignInBtn: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  googleBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  googleSignInText: {
    color: "#1f2937",
    fontSize: 14,
    fontWeight: "700",
  },
  googleSignInHint: {
    fontSize: 11,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 15,
  },
  advancedToggleBtn: {
    alignSelf: "center",
    marginTop: 12,
    paddingVertical: 4,
  },
  advancedContainer: {
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  advancedLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  saveTokenBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  kpiContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingBottom: 14,
  },
  kpiItem: {
    alignItems: "center",
    flex: 1,
  },
  kpiVal: {
    fontSize: 18,
    fontWeight: "800",
  },
  kpiLbl: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: "600",
  },
  kpiDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  prefLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  prefDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  pillSelector: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 8,
    padding: 2,
    marginLeft: 8,
  },
  pillOption: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuRowTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  menuRowDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  menuRowArrow: {
    fontSize: 20,
    marginLeft: 8,
  },
  wipeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  wipeTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  wipeDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  wipeBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  wipeBtnText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "700",
  },
  footerInfo: {
    marginTop: 16,
    alignItems: "center",
  },
  footerText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
