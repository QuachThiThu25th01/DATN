import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Image, ScrollView, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import apiClient, { BASE_URL, getFullUrl } from '@/constants/api';
import { useAuth } from '@/hooks/useAuth';
import { Redirect, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

// Import placeholder image (using require as it's a local asset)
const NO_SIGNAL = require('@/assets/images/no_signal.png');

interface Space {
  id: number;
  name: string;
  type: string;
  preview_url?: string;
  is_active?: boolean;
}

interface ViolationHistory {
  url: string;
  time: string;
  behavior: string;
  student_name?: string;
  student_code?: string;
}

interface RealtimeStats {
  counts: {
    total: number;
    focused: number;
    phone: number;
    sleep: number;
    session_title?: string;
  };
  history: ViolationHistory[];
}

// Mock data for demo/presentation purposes
const MOCK_STATS: RealtimeStats = {
  counts: {
    total: 25,
    focused: 22,
    phone: 2,
    sleep: 1,
    session_title: "Học máy (Tự động tải mẫu)"
  },
  history: [
    { url: "/static/violations/demo1.jpg", time: "10:45", behavior: "using_phone" },
    { url: "/static/violations/demo2.jpg", time: "10:42", behavior: "sleeping" },
  ]
};

export default function MonitoringScreen() {
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<number | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [stats, setStats] = useState<RealtimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const loadTheme = async () => {
        try {
          const saved = await AsyncStorage.getItem('IS_DARK_MODE');
          if (saved !== null && isMounted) {
            setIsDarkMode(JSON.parse(saved));
          }
        } catch (e) {}
      };
      loadTheme();
      return () => { isMounted = false; };
    }, [])
  );

  const themeBg = isDarkMode ? '#030f16' : '#f8fafc';
  const themeCardBg = isDarkMode ? '#081a24' : '#ffffff';
  const themeBorder = isDarkMode ? '#122c3b' : '#e2e8f0';
  const themeText = isDarkMode ? '#ffffff' : '#0f172a';
  const themeSubText = isDarkMode ? '#94a3b8' : '#64748b';
  const themePrimary = isDarkMode ? '#00f5d4' : '#4f46e5';

  useEffect(() => {
    if (user) {
      fetchSpaces();
    }
  }, [user]);

  const fetchSpaces = async () => {
    try {
      const response = await apiClient.get('/api/spaces/list');
      setSpaces(response.data);
      setIsOffline(false);
    } catch (error) {
      console.error('Error fetching spaces:', error);
      setIsOffline(true);
      setSpaces([
        { id: 7, name: "thuvien7 (Demo)", type: "library" },
        { id: 1, name: "D2.03 (Demo)", type: "classroom" }
      ]);
    } finally {
      setLoading(false);
    }
  };


  const startMonitoring = async (spaceId: number) => {
    try {
      setLoading(true);
      apiClient.post('/select_room', { room: spaceId }).catch(e => console.log("Server unreachable"));
      setSelectedSpace(spaceId);
      setIsMonitoring(true);
    } catch (error) {
      console.error('Error starting monitoring:', error);
    } finally {
      setLoading(false);
    }
  };

  const stopMonitoring = () => {
    setIsMonitoring(false);
  };

  // Fetch stats realtime
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isMonitoring) {
      interval = setInterval(async () => {
        try {
          const response = await apiClient.get('/get_realtime_data');
          setStats(response.data);
          setIsOffline(false);
        } catch (e) {
          setIsOffline(true);
          if (!stats) setStats(MOCK_STATS);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isMonitoring, stats]);

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (loading && spaces.length === 0) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color="#0a7ea4" />
      </ThemedView>
    );
  }

  const currentStats = (!stats || !stats.counts || !stats.counts.total) ? MOCK_STATS : stats;

  return (
    <ScrollView style={[styles.container, { backgroundColor: themeBg }]}>
      {!isMonitoring ? (
        <View style={styles.selectionContainer}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: themeText }]}>Chọn phòng để giám sát</ThemedText>
          {isOffline && (
            <View style={styles.offlineAlert}>
              <Ionicons name="cloud-offline" size={16} color="#ef4444" />
              <ThemedText style={styles.offlineText}>Đang ở chế độ Demo (Server không phản hồi)</ThemedText>
            </View>
          )}
          {spaces.map((space) => (
            <TouchableOpacity 
              key={space.id} 
              style={[
                styles.spaceCard, 
                { backgroundColor: themeCardBg, borderColor: themeBorder },
                space.is_active && styles.spaceCardActive
              ]}
              onPress={() => startMonitoring(space.id)}
            >
              <View style={styles.spaceIcon}>
                {space.preview_url ? (
                  <Image 
                    source={{ uri: getFullUrl(space.preview_url) }} 
                    style={styles.spacePreview} 
                  />
                ) : (
                  <Ionicons name="business" size={24} color="#0a7ea4" />
                )}
              </View>
              <View style={styles.spaceInfo}>
                <ThemedText style={styles.spaceName}>{space.name}</ThemedText>
                <ThemedText style={styles.spaceType}>{space.type}</ThemedText>
              </View>
              {space.is_active && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <ThemedText style={styles.liveBadgeText}>LIVE</ThemedText>
                </View>
              )}
              <Ionicons name="chevron-forward" size={20} color="#687076" />
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.monitorContainer}>
          <View style={styles.dashboardHeader}>
            <TouchableOpacity onPress={stopMonitoring} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
              <ThemedText style={styles.backText}>Quay lại</ThemedText>
            </TouchableOpacity>
            <View style={styles.headerTextGroup}>
              <ThemedText style={styles.activeRoomTitle}>
                {spaces.find(s => s.id === selectedSpace)?.name}
              </ThemedText>
              <ThemedText style={styles.liveStatusText}>● ĐANG GIÁM SÁT</ThemedText>
            </View>
            {isOffline && (
              <View style={styles.offlineBadge}>
                <ThemedText style={styles.offlineBadgeText}>OFFLINE</ThemedText>
              </View>
            )}
          </View>

          <View style={styles.dashboardContent}>
            <View style={styles.sessionBox}>
               <ThemedText style={styles.sessionTitleLabel}>Môn học hiện tại:</ThemedText>
               <ThemedText style={styles.sessionValue}>
                  {currentStats?.counts?.session_title || "N/A"}
               </ThemedText>
            </View>

            <View style={styles.statGrid}>
              <View style={styles.statCard}>
                <ThemedText style={styles.statLabel}>TỔNG SINH VIÊN</ThemedText>
                <ThemedText style={styles.statValueMain}>{currentStats?.counts?.total || 0}</ThemedText>
              </View>
              
              <View style={styles.statCard}>
                <ThemedText style={styles.statLabel}>ĐANG TẬP TRUNG</ThemedText>
                <ThemedText style={[styles.statValueMain, {color: '#10b981'}]}>
                  {currentStats?.counts?.focused || 0}
                </ThemedText>
              </View>

              <View style={styles.statCard}>
                <ThemedText style={styles.statLabel}>DÙNG ĐIỆN THOẠI</ThemedText>
                <ThemedText style={[styles.statValueMain, {color: '#f59e0b'}]}>
                  {currentStats?.counts?.phone || 0}
                </ThemedText>
              </View>

              <View style={styles.statCard}>
                <ThemedText style={styles.statLabel}>SV NGỦ GẬT</ThemedText>
                <ThemedText style={[styles.statValueMain, {color: '#ef4444'}]}>
                  {currentStats?.counts?.sleep || 0}
                </ThemedText>
              </View>
            </View>

            <ThemedView style={styles.violationsHeader}>
              <ThemedText type="subtitle" style={{color: '#1e293b'}}>Hình ảnh minh chứng học tập gần đây</ThemedText>
            </ThemedView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.evidenceScroll} contentContainerStyle={{ paddingRight: 20 }}>
              {currentStats?.history?.map((v: ViolationHistory, index: number) => {
                const isStranger = v.student_name?.includes("Người lạ") || !v.student_name;
                return (
                  <View key={index} style={[styles.evidenceCard, isStranger && { borderColor: '#ef4444', borderWidth: 1.5 }]}>
                    <View style={styles.imageContainer}>
                      <Image 
                        source={isOffline ? require('@/assets/images/icon.png') : { uri: getFullUrl(v.url) }} 
                        style={styles.evidenceThumb} 
                      />
                      <View style={[
                        styles.behaviorBadge, 
                        { backgroundColor: isStranger ? '#ef4444' : (v.behavior === 'using_phone' ? '#f59e0b' : '#4f46e5') }
                      ]}>
                        <Ionicons 
                          name={isStranger ? 'alert-circle' : (v.behavior === 'using_phone' ? 'phone-portrait' : 'moon')} 
                          size={12} 
                          color="#fff" 
                        />
                        <ThemedText style={styles.behaviorBadgeText}>
                          {isStranger ? 'NGƯỜI LẠ' : (v.behavior === 'using_phone' ? 'Điện thoại' : 'Ngủ gật')}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.evidenceInfo}>
                      <ThemedText style={[styles.evidenceName, isStranger && { color: '#ef4444' }]}>
                        {v.student_name || 'Người lạ #??'}
                      </ThemedText>
                      {v.student_code ? (
                        <ThemedText style={{fontSize: 11, color: '#64748b', fontWeight: '700'}}>MSSV: {v.student_code}</ThemedText>
                      ) : (
                        isStranger && <ThemedText style={{fontSize: 11, color: '#ef4444', fontWeight: '900'}}>AN NINH</ThemedText>
                      )}
                      <View style={styles.evidenceTimeRow}>
                        <Ionicons name="time-outline" size={12} color="#64748b" />
                        <ThemedText style={styles.evidenceTime}>{v.time}</ThemedText>
                      </View>
                    </View>
                  </View>
                );
              })}
              {(!currentStats?.history || currentStats.history.length === 0) && (
                <View style={styles.emptyEvidence}>
                  <Ionicons name="checkmark-circle" size={48} color="#10b981" style={{opacity: 0.3}} />
                  <ThemedText style={styles.noViolation}>Không có hành vi mất tập trung nào</ThemedText>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  selectionContainer: { padding: 24 },
  sectionTitle: { marginBottom: 20, color: '#1e293b', fontWeight: '800' },
  spaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 2,
  },
  spaceCardActive: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  spaceIcon: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#0a7ea420',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },
  spacePreview: { width: '100%', height: '100%' },
  spaceInfo: { flex: 1 },
  spaceName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  spaceType: { fontSize: 13, opacity: 0.5 },
  
  monitorContainer: { flex: 1 },
  dashboardHeader: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  backText: { display: 'none' },
  headerTextGroup: { flex: 1 },
  activeRoomTitle: { color: '#1e293b', fontSize: 20, fontWeight: '800' },
  liveStatusText: { color: '#10b981', fontSize: 12, fontWeight: '700', marginTop: 4 },
  
  dashboardContent: { padding: 20 },
  sessionBox: {
    backgroundColor: '#fffbeb',
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: 20,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  sessionTitleLabel: { color: '#d97706', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sessionValue: { color: '#1e293b', fontSize: 18, fontWeight: '800', marginTop: 4 },
  
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: (width - 56) / 2,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  statLabel: { color: '#64748b', fontSize: 10, fontWeight: '800', marginBottom: 8, letterSpacing: 0.5 },
  statValueMain: { color: '#1e293b', fontSize: 32, fontWeight: '900' },
  
  violationsHeader: { paddingVertical: 10, marginBottom: 15, backgroundColor: 'transparent' },
  evidenceScroll: { flexDirection: 'row', marginTop: 10 },
  evidenceCard: {
    marginRight: 16,
    width: 220,
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 140,
  },
  evidenceThumb: { 
    width: '100%', 
    height: '100%',
    backgroundColor: '#f1f5f9',
  },
  behaviorBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  behaviorBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  evidenceInfo: { padding: 16 },
  evidenceName: { color: '#1e293b', fontSize: 16, fontWeight: '700' },
  evidenceTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  evidenceTime: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  
  emptyEvidence: {
    width: width - 40,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 20,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  noViolation: { color: '#888', marginTop: 10, fontSize: 14 },
  
  offlineAlert: {
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  offlineText: { color: '#dc2626', fontSize: 13, fontWeight: '600', marginLeft: 8 },
  offlineBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  offlineBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  liveBadgeText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
});

