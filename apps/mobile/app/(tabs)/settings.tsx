import { useMemo } from "react";
import Constants from "expo-constants";
import { Icon } from "@/components/Controls";
import { AppearanceCard } from "@/components/AppearanceCard";
import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  View,
  Alert,
  Platform,
  ActivityIndicator,
  Switch,
  Image,
} from "react-native";
import { useTheme, type Palette } from "@/src/theme";
import { Text } from "@/components/Themed";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { exportBackupData, analyzeBackup, executeImport } from "@/src/db/backup";
import { parseBackup } from "@carbaddie/core";
import { deleteAllVehicles } from "@/src/db/repository";
import { restoreDefaultServiceTypes } from "@/src/db/seed";
import type { FullBackupData } from "@/src/types";
import {
  useVehicles,
  useServiceTypes,
  useSetPreference,
} from "@/src/hooks/useDatabase";
import { useUnits } from "@/src/hooks/useUnits";
import { COMMON_CURRENCIES } from "@carbaddie/core";
import {
  getGoogleDriveStatus,
  disconnectGoogleDrive,
  signInWithGoogle,
  setAutoSyncEnabled,
  syncNow,
  type GoogleDriveStatus,
} from "@/src/services/googleDrive";
import * as repo from "@/src/db/repository";
import { areRemindersEnabled, setRemindersOn } from "@/src/services/reminders";
import { useQueryClient } from "@tanstack/react-query";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  // Currency and distance unit: synced to your other devices.
  const units = useUnits();
  const { mutate: setPreference } = useSetPreference();
  const odometerUnit = units.unit;
  const handleSetUnit = (unit: "km" | "mi") => setPreference({ key: "distance_unit", value: unit });
  const currencies = (COMMON_CURRENCIES as readonly string[]).includes(units.currency)
    ? [...COMMON_CURRENCIES]
    : [units.currency, ...COMMON_CURRENCIES];

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
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      const res = await signInWithGoogle();
      if (res.success) {
        await refreshDriveStatus();
        await syncNow();
        await refreshDriveStatus();
        Alert.alert("Connected", `Signed in as ${res.email || "Google account"}. Your devices now sync through Google Drive.`);
      } else if (res.error) {
        Alert.alert("Sign in", res.error);
      }
    } catch (e: any) {
      Alert.alert("Sync error", e.message || "Signed in, but the first sync failed.");
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      setIsSyncing(true);
      const res = await syncNow();
      await refreshDriveStatus();
      Alert.alert(
        "Synced",
        res.applied > 0
          ? `${res.applied} change${res.applied === 1 ? "" : "s"} from your other devices applied.`
          : "Everything is in sync.",
      );
    } catch (e: any) {
      Alert.alert("Sync error", e.message || "Failed to sync with Google Drive.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Maintenance reminders: a device-local setting.
  const [remindersOn, setRemindersOnState] = useState(true);
  useEffect(() => {
    areRemindersEnabled().then(setRemindersOnState).catch(() => undefined);
  }, []);
  const handleToggleReminders = async (value: boolean) => {
    setRemindersOnState(value);
    try {
      const granted = await setRemindersOn(value);
      if (value && !granted) {
        Alert.alert("Notifications off", "Allow notifications for CarBaddie in Android settings to get maintenance reminders.");
      }
    } catch (e: any) {
      Alert.alert("Reminders", e.message || "Failed to update maintenance reminders.");
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
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await disconnectGoogleDrive();
          await refreshDriveStatus();
        },
      },
    ]);
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
        Alert.alert("Success", "Backup downloaded");
      } else {
        const fileUri = FileSystem.cacheDirectory + fileName;
        await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/json",
            dialogTitle: "Save CarBaddie backup",
          });
        }
        Alert.alert("Success", "Backup exported");
      }
    } catch (e: any) {
      Alert.alert("Export failed", e.message ?? "Unknown error");
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
      await processRestorePlan(parseBackup(JSON.parse(content)));
    } catch (e: any) {
      Alert.alert("Import failed", e.message ?? "Unknown error");
    } finally {
      setIsImporting(false);
    }
  };

  const processRestorePlan = async (backupData: FullBackupData) => {
    const analysis = await analyzeBackup(backupData);
    const newCount = analysis.new_vehicles.length;
    const conflictCount = analysis.conflicting_vehicles.length;

    let message = "";
    if (newCount > 0) message += `${newCount} new vehicle(s) will be added\n`;
    if (conflictCount > 0) message += `${conflictCount} existing vehicle(s) will be replaced\n`;

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
        Alert.alert("Success", "Backup restored");
      } catch (err: any) {
        Alert.alert("Import failed", err.message ?? "Unknown error");
      }
    };

    Alert.alert(
      "Restore backup",
      `${message || "No vehicle conflicts found."}\nProceed with restoring records?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Restore data", style: "default", onPress: performRestore },
      ]
    );
  };

  const handleSeedDefaults = async () => {
    try {
      setIsSeeding(true);
      const count = await restoreDefaultServiceTypes();
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
      "Wipe garage database",
      "Are you sure you want to delete ALL vehicles and maintenance logs? This action is permanent and cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Wipe everything",
          style: "destructive",
          onPress: async () => {
            try {
              setIsWiping(true);
              await deleteAllVehicles();
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
          <Text style={[styles.brandSubtitle, { color: colors.textSecondary }]}>
            Maintenance tracker for your vehicles
          </Text>
        </View>
      </View>

      {/* SECTION 1: CLOUD SYNC */}
      <View style={styles.sectionGroup}>
        <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>Sync</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Google Drive</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
                Syncs your records between phone and PC through your own Google Drive.
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: driveStatus.isConnected ? colors.okBg : colors.raised,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  { color: driveStatus.isConnected ? colors.ok : colors.textMuted },
                ]}
              >
                {driveStatus.isConnected ? "Active" : "Off"}
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
                    {driveStatus.email || "Google account"}
                  </Text>
                  <Text style={[styles.accountMeta, { color: colors.textMuted }]}>
                    {driveStatus.lastSyncTime
                      ? `Last synced: ${new Date(driveStatus.lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "Automatic background sync active"}
                  </Text>
                </View>
              </View>

              <View style={[styles.switchRow, { borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.switchTitle, { color: colors.text }]}>Automatic sync</Text>
                  <Text style={[styles.switchDesc, { color: colors.textMuted }]}>
                    Syncs changes automatically when you add logs or open the app.
                  </Text>
                </View>
                <Switch
                  value={driveStatus.autoSyncEnabled}
                  onValueChange={handleToggleAutoSync}
                  trackColor={{ false: colors.textMuted, true: colors.accent }} thumbColor="#ffffff"
                />
              </View>

              <View style={styles.cloudActionRow}>
                <TouchableOpacity accessibilityRole="button"
                  style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSyncNow}
                  disabled={isSyncing}
                  activeOpacity={0.8}
                >
                  {isSyncing ? (
                    <ActivityIndicator color={colors.onPrimary} size="small" />
                  ) : (
                    <Text style={styles.primaryActionText}>Sync now</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity accessibilityRole="button" style={styles.ghostActionBtn} onPress={handleDisconnectDrive}>
                  <Text style={styles.ghostActionText}>Sign out</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 8 }}>
              <TouchableOpacity accessibilityRole="button"
                style={styles.googleSignInBtn}
                onPress={handleGoogleSignIn}
                disabled={isSigningIn}
                activeOpacity={0.85}
              >
                {isSigningIn ? (
                  <ActivityIndicator color="#1f2937" size="small" />
                ) : (
                  <View style={styles.googleBtnInner}>
                    <View style={styles.googleBadge}>
                      <Text style={styles.googleG}>G</Text>
                    </View>
                    <Text style={styles.googleSignInText}>Sign in with Google</Text>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={[styles.googleSignInHint, { color: colors.textMuted }]}>
                Sign in to sync your garage between devices through your personal Google Drive.
              </Text>

            </View>
          )}
        </View>
      </View>

      {/* SECTION 2: GARAGE TELEMETRY & PREFERENCES */}
      <View style={styles.sectionGroup}>
        <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>Preferences</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Stats Bar */}
          <View style={styles.kpiContainer}>
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiVal, { color: colors.text }]}>{vehicles.length}</Text>
              <Text style={[styles.kpiLbl, { color: colors.textMuted }]}>Vehicles</Text>
            </View>
            <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiVal, { color: colors.text }]}>{totalLogsCount}</Text>
              <Text style={[styles.kpiLbl, { color: colors.textMuted }]}>Service logs</Text>
            </View>
            <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiVal, { color: colors.text }]}>{serviceTypes.length}</Text>
              <Text style={[styles.kpiLbl, { color: colors.textMuted }]}>Service types</Text>
            </View>
          </View>

          {/* Unit Switcher */}
          <View style={[styles.prefRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.prefLabel, { color: colors.text }]}>Distance units</Text>
              <Text style={[styles.prefDesc, { color: colors.textMuted }]}>
                Stored in km; switching converts what you see
              </Text>
            </View>
            <View style={[styles.pillSelector, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <TouchableOpacity accessibilityRole="button"
                style={[styles.pillOption, odometerUnit === "km" && { backgroundColor: colors.primary }]}
                onPress={() => handleSetUnit("km")}
              >
                <Text style={{ color: odometerUnit === "km" ? colors.onPrimary : colors.text, fontSize: 12, fontWeight: "600" }}>
                  km
                </Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button"
                style={[styles.pillOption, odometerUnit === "mi" && { backgroundColor: colors.primary }]}
                onPress={() => handleSetUnit("mi")}
              >
                <Text style={{ color: odometerUnit === "mi" ? colors.onPrimary : colors.text, fontSize: 12, fontWeight: "600" }}>
                  miles
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Currency */}
          <View style={[styles.prefRow, { borderTopColor: colors.border, flexDirection: "column", alignItems: "stretch" }]}>
            <Text style={[styles.prefLabel, { color: colors.text }]}>Currency</Text>
            <Text style={[styles.prefDesc, { color: colors.textMuted }]}>
              All costs are shown in it; changing it doesn't convert amounts
            </Text>
            <View style={styles.currencyGrid} accessibilityRole="radiogroup">
              {currencies.map((code) => {
                const active = units.currency === code;
                return (
                  <TouchableOpacity
                    key={code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={code}
                    style={[styles.currencyPill, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.background }]}
                    onPress={() => setPreference({ key: "currency", value: code })}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: active ? colors.onPrimary : colors.text, fontSize: 14, fontWeight: "600" }}>{code}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Maintenance reminders (this phone only) */}
          <View style={[styles.prefRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.prefLabel, { color: colors.text }]}>Maintenance reminders</Text>
              <Text style={[styles.prefDesc, { color: colors.textMuted }]}>
                A notification when a service is due soon or overdue
              </Text>
            </View>
            <Switch
              value={remindersOn}
              onValueChange={handleToggleReminders}
              trackColor={{ false: colors.textMuted, true: colors.accent }} thumbColor="#ffffff"
            />
          </View>
        </View>
      </View>

      {/* SECTION: APPEARANCE */}
      <View style={styles.sectionGroup}>
        <Text style={[styles.groupHeader, { color: colors.textSecondary }]} accessibilityRole="header">Appearance</Text>
        <AppearanceCard />
      </View>

      {/* SECTION 3: DATA MANAGEMENT */}
      <View style={styles.sectionGroup}>
        <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>Data and backup</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0 }]}>
          <TouchableOpacity accessibilityRole="button"
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            onPress={handleExport}
            disabled={isExporting}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuRowTitle, { color: colors.text }]}>Export backup (JSON)</Text>
              <Text style={[styles.menuRowDesc, { color: colors.textMuted }]}>
                Download or share your entire fleet database file
              </Text>
            </View>
            {isExporting ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Icon name="chevron" color={colors.textMuted} size={16} />
            )}
          </TouchableOpacity>

          <TouchableOpacity accessibilityRole="button"
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            onPress={handleImport}
            disabled={isImporting}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuRowTitle, { color: colors.text }]}>Import from backup file</Text>
              <Text style={[styles.menuRowDesc, { color: colors.textMuted }]}>
                Restore records from a CarBaddie backup JSON
              </Text>
            </View>
            {isImporting ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Icon name="chevron" color={colors.textMuted} size={16} />
            )}
          </TouchableOpacity>

          <TouchableOpacity accessibilityRole="button"
            style={styles.menuRow}
            onPress={handleSeedDefaults}
            disabled={isSeeding}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuRowTitle, { color: colors.text }]}>Reset built-in service types</Text>
              <Text style={[styles.menuRowDesc, { color: colors.textMuted }]}>
                Load 25 standard automotive service schedules & suggestions
              </Text>
            </View>
            {isSeeding ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Icon name="chevron" color={colors.textMuted} size={16} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* SECTION 4: DANGER ZONE */}
      <View style={styles.sectionGroup}>
        <Text style={[styles.groupHeader, { color: colors.danger }]}>Danger zone</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.wipeRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.wipeTitle, { color: colors.danger }]}>Wipe garage database</Text>
              <Text style={[styles.wipeDesc, { color: colors.textMuted }]}>
                Permanently delete all vehicles, logs, and interval overrides on this device.
              </Text>
            </View>
            <TouchableOpacity accessibilityRole="button"
              style={[styles.wipeBtn, { backgroundColor: colors.dangerBg, borderColor: colors.border }]}
              onPress={handleWipeDatabase}
              disabled={isWiping}
              activeOpacity={0.8}
            >
              {isWiping ? (
                <ActivityIndicator color={colors.danger} size="small" />
              ) : (
                <Text style={styles.wipeBtnText}>Wipe all</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Footer Info */}
      <View style={styles.footerInfo}>
        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          CarBaddie {Constants.expoConfig?.version ?? ""}
        </Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
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
    fontWeight: "600",
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
    fontSize: 12,
    fontWeight: "600",
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
    fontWeight: "600",
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
    fontSize: 12,
    fontWeight: "600",
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
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
  accountEmail: {
    fontSize: 14,
    fontWeight: "600",
  },
  accountMeta: {
    fontSize: 12,
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
    fontSize: 12,
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
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  ghostActionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  ghostActionText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  googleSignInBtn: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dadce0",
    minHeight: 48,
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
    fontWeight: "600",
  },
  googleSignInHint: {
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 15,
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
    fontWeight: "600",
  },
  kpiLbl: {
    fontSize: 12,
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
    fontSize: 12,
    marginTop: 2,
  },
  currencyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  currencyPill: { minWidth: 64, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
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
    fontSize: 12,
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
    fontWeight: "600",
  },
  wipeDesc: {
    fontSize: 12,
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
    color: colors.danger,
    fontSize: 12,
    fontWeight: "600",
  },
  footerInfo: {
    marginTop: 16,
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
  },
});
