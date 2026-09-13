import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { StyleSheet, View, FlatList, ActivityIndicator, RefreshControl, Image, TouchableOpacity, Modal, ScrollView, Dimensions, TextInput, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import apiClient, { getFullUrl } from '@/constants/api';
import { useAuth } from '@/hooks/useAuth';
import { Redirect, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart } from 'react-native-chart-kit';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

const { width } = Dimensions.get('window');

interface Session {
  id: number;
  title: string;
  start_time_str: string;
  end_time_str: string;
  status: string;
  space_name: string;
  avg_focus: number;
}

interface SessionHistoryPoint {
    time: string;
    focus: number;
}

interface SessionDetail {
  info: {
    id: number;
    title: string;
    space_name: string;
    duration_minutes: number;
    avg_focus: number;
    phone_uses: number;
    sleep_uses: number;
  };
  album: {
    id: number;
    image_path: string;
    behavior: string;
    time: string;
  }[];
  chart: SessionHistoryPoint[];
}

interface Space {
    id: number;
    name: string;
}

export default function HistoryScreen() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Load theme mode for all roles when focused
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const loadTheme = async () => {
        try {
          const saved = await AsyncStorage.getItem('IS_DARK_MODE');
          if (saved !== null && isMounted) {
            setIsDarkMode(JSON.parse(saved));
          } else if (user?.role === 'student' && isMounted) {
            setIsDarkMode(true);
          }
        } catch (e) {}
      };
      loadTheme();
      return () => { isMounted = false; };
    }, [user])
  );
  
  // Dynamic theme colors for all roles
  const isStudentDark = isDarkMode;
  const themeBg = isStudentDark ? '#030f16' : '#f8fafc';
  const themeCardBg = isStudentDark ? '#081a24' : '#ffffff';
  const themeBorder = isStudentDark ? '#122c3b' : '#e2e8f0';
  const themeText = isStudentDark ? '#ffffff' : '#1e293b';
  const themeSubText = isStudentDark ? '#94a3b8' : '#64748b';
  const themePrimary = isStudentDark ? '#00f5d4' : '#4f46e5';
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);

  // Detail Modal States
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Date Filter States
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fetchHistory = async (dateParam: string | null = null) => {
    try {
      let url = '/api/sessions/history';
      const params = new URLSearchParams();
      params.append('user_id', String(user?.id));
      
      const effectiveDate = dateParam || (selectedDate ? selectedDate.toISOString().split('T')[0] : null);
      if (effectiveDate) {
        params.append('date', effectiveDate);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const hRes = await apiClient.get(url);
      setSessions(hRes.data);
      
      const sRes = await apiClient.get(`/api/spaces/list?user_id=${user?.id}`);
      setSpaces(sRes.data);
    } catch (error) {
      console.error('History fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchDetail = async (id: number) => {
    setDetailLoading(true);
    setShowModal(true);
    setSelectedSessionId(id);
    try {
      const response = await apiClient.get(`/api/sessions/${id}/detail?user_id=${user?.id}`);
      setDetailData(response.data);
    } catch (error) {
      console.error('Detail fetch error:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user, selectedDate]);

  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
        const matchesSearch = session.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             session.space_name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSpace = selectedSpaceId === null || session.space_name === spaces.find(s => s.id === selectedSpaceId)?.name;
        return matchesSearch && matchesSpace;
    });
  }, [sessions, searchQuery, selectedSpaceId, spaces]);

  // Logic xử lý dữ liệu biểu đồ cho ca học
  const chartData = useMemo(() => {
    if (!detailData || !detailData.chart || detailData.chart.length < 2) return null;
    
    // Giảm bớt số điểm nếu dữ liệu quá dày để biểu đồ đỡ bị rối
    const step = Math.max(1, Math.floor(detailData.chart.length / 10));
    const sampled = detailData.chart.filter((_, i) => i % step === 0);
    
    return {
        labels: sampled.map(p => p.time ? p.time.substring(0, 5) : "--:--"), // Lấy HH:MM
        datasets: [
            {
                data: sampled.map(p => {
                    const val = Number(p.focus);
                    return isNaN(val) ? 0 : val;
                }),
                color: (opacity = 1) => isStudentDark ? `rgba(0, 245, 212, ${opacity})` : `rgba(79, 70, 229, ${opacity})`,
                strokeWidth: 3
            }
        ],

        legend: ["Độ tập trung (%)"]
    };
  }, [detailData, isStudentDark]);

  if (!user) {
    return <Redirect href="/login" />;
  }

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const closeModal = () => {
    setShowModal(false);
    setDetailData(null);
  };

  const onDateChange = (event: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
    }
  };

  const clearDateFilter = () => {
    setSelectedDate(null);
  };

  const renderItem = ({ item }: { item: Session }) => {
    const isOngoing = item.status !== 'completed';
    return (
      <TouchableOpacity style={[styles.sessionCard, { backgroundColor: themeCardBg, borderColor: themeBorder }, isOngoing && styles.ongoingCard]} onPress={() => fetchDetail(item.id)}>
        <View style={styles.sessionHeader}>
          <View style={[styles.sessionIcon, isOngoing && styles.ongoingIcon, { backgroundColor: isStudentDark ? 'rgba(0, 245, 212, 0.1)' : '#eef2ff' }]}>
            <Ionicons name={isOngoing ? "play-circle" : "calendar"} size={22} color={isOngoing ? "#10b981" : themePrimary} />
          </View>
          <View style={styles.sessionMainInfo}>
            <ThemedText style={[styles.sessionTitle, { color: themeText }]} numberOfLines={1}>{item.title}</ThemedText>
            <ThemedText style={[styles.sessionSpace, { color: themeSubText }]}>{item.space_name}</ThemedText>
          </View>
          <View style={[styles.focusBadge, { backgroundColor: themeBorder }]}>
            <ThemedText style={[styles.focusValue, { color: item.avg_focus > 80 ? '#10b981' : themePrimary }]}>{item.avg_focus.toFixed(1)}%</ThemedText>
            <ThemedText style={styles.focusLabel}>TẬP TRUNG</ThemedText>
          </View>
        </View>
        <View style={[styles.sessionFooter, { borderTopColor: themeBorder }]}>
          <View style={styles.timeRow}><Ionicons name="time-outline" size={14} color={themeSubText} /><ThemedText style={[styles.timeText, { color: themeSubText }]}>{item.start_time_str}</ThemedText></View>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isOngoing ? "#10b981" : "#94a3b8" }]} />
            <ThemedText style={[styles.statusText, { color: isOngoing ? "#10b981" : themeSubText }]}>{isOngoing ? 'Đang diễn ra' : 'Đã kết thúc'}</ThemedText>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeBg }]}>
      <FlatList
        data={filteredSessions}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            <ThemedText type="subtitle" style={[styles.listTitle, { color: themeText }]}>Lịch sử các phiên giám sát</ThemedText>
            <View style={styles.searchRow}>
                <View style={[styles.searchContainer, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
                    <Ionicons name="search-outline" size={20} color={themeSubText} />
                    <TextInput placeholder="Tìm kiếm môn học, phòng..." value={searchQuery} onChangeText={setSearchQuery} style={[styles.searchInput, { color: themeText }]} placeholderTextColor={themeSubText} />
                    {searchQuery !== '' && <TouchableOpacity onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={18} color={themeSubText} /></TouchableOpacity>}
                </View>
                <TouchableOpacity style={[styles.dateFilterBtn, { backgroundColor: themeCardBg, borderColor: themeBorder }, selectedDate && [styles.dateFilterActive, { backgroundColor: themePrimary, borderColor: themePrimary }]]} onPress={() => setShowDatePicker(true)}>
                    <Ionicons name="calendar-outline" size={22} color={selectedDate ? "#fff" : themePrimary} />
                </TouchableOpacity>
            </View>

            {showDatePicker && (
                <DateTimePicker
                    value={selectedDate || new Date()}
                    mode="date"
                    display="default"
                    onChange={onDateChange}
                />
            )}

            {selectedDate && (
                <View style={styles.activeFilters}>
                    <View style={[styles.dateChip, { backgroundColor: themeBorder, borderColor: themeBorder }]}>
                        <Ionicons name="calendar" size={14} color={themePrimary} />
                        <ThemedText style={[styles.dateChipText, { color: themePrimary }]}>
                            {selectedDate.toLocaleDateString('vi-VN')}
                        </ThemedText>
                        <TouchableOpacity onPress={clearDateFilter}>
                            <Ionicons name="close-circle" size={16} color={themePrimary} />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterPills}>
                <TouchableOpacity style={[styles.pill, { backgroundColor: themeCardBg, borderColor: themeBorder }, selectedSpaceId === null && [styles.pillActive, { backgroundColor: themePrimary, borderColor: themePrimary }]]} onPress={() => setSelectedSpaceId(null)}>
                    <ThemedText style={[styles.pillText, { color: themeSubText }, selectedSpaceId === null && [styles.pillTextActive, { color: isStudentDark ? '#030f16' : '#fff' }]]}>Tất cả</ThemedText>
                </TouchableOpacity>
                {spaces.map(space => (
                    <TouchableOpacity key={space.id} style={[styles.pill, { backgroundColor: themeCardBg, borderColor: themeBorder }, selectedSpaceId === space.id && [styles.pillActive, { backgroundColor: themePrimary, borderColor: themePrimary }]]} onPress={() => setSelectedSpaceId(space.id)}>
                        <ThemedText style={[styles.pillText, { color: themeSubText }, selectedSpaceId === space.id && [styles.pillTextActive, { color: isStudentDark ? '#030f16' : '#fff' }]]}>{space.name}</ThemedText>
                    </TouchableOpacity>
                ))}
            </ScrollView>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color={themeBorder} />
            <ThemedText style={[styles.emptyText, { color: themeSubText }]}>{searchQuery || selectedSpaceId ? "Không có kết quả lọc phù hợp" : "Chưa có dữ liệu lịch sử"}</ThemedText>
          </View>
        }
      />

      {/* DETAIL MODAL */}
      <Modal visible={showModal} animationType="slide" transparent={true} onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeBorder }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <ThemedText style={[styles.modalHeaderTitle, { color: themeText }]}>Chi tiết ca học</ThemedText>
                <ThemedText style={[styles.modalHeaderSub, { color: themeSubText }]} numberOfLines={2}>
                    {detailData ? detailData.info.title : `Đang tải mã phiên: #${selectedSessionId}...`}
                </ThemedText>
              </View>
              <TouchableOpacity onPress={closeModal} style={[styles.closeBtn, { backgroundColor: themeBorder }]}><Ionicons name="close" size={24} color={themePrimary} /></TouchableOpacity>
            </View>

            {detailLoading ? (
              <View style={styles.modalLoading}><ActivityIndicator size="large" color={themePrimary} /></View>
            ) : (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {detailData && (
                  <>
                    <View style={styles.detailInfoBox}>
                        <ThemedText style={[styles.detailSubject, { color: themeText }]}>{detailData.info.title}</ThemedText>
                        <ThemedText style={[styles.detailRoom, { color: themeSubText }]}>{detailData.info.space_name}</ThemedText>
                    </View>

                    <View style={styles.chartBox}>
                        <ThemedText style={[styles.sectionHeading, { color: themeText }]}>Biểu đồ diễn biến tập trung (%)</ThemedText>
                        {chartData ? (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <LineChart
                                    data={chartData}
                                    width={Math.max(width - 60, (detailData?.chart?.length || 0) * 55)}
                                    height={240}
                                    chartConfig={{
                                        backgroundColor: themeCardBg,
                                        backgroundGradientFrom: themeCardBg,
                                        backgroundGradientTo: themeCardBg,
                                        decimalPlaces: 0,
                                        color: (opacity = 1) => isStudentDark ? `rgba(0, 245, 212, ${opacity})` : `rgba(79, 70, 229, ${opacity})`,
                                        labelColor: (opacity = 1) => isStudentDark ? `rgba(148, 163, 184, ${opacity})` : `rgba(100, 116, 139, ${opacity})`,
                                        propsForDots: { r: "4", strokeWidth: "1", stroke: themePrimary },
                                        fillShadowGradient: themePrimary,
                                        fillShadowGradientOpacity: 0.15,
                                        paddingRight: 35,
                                        paddingTop: 10,
                                        xLabelsOffset: -4,
                                    }}
                                    bezier
                                    style={{ marginVertical: 8, borderRadius: 16 }}
                                    verticalLabelRotation={45}
                                />
                            </ScrollView>
                        ) : (
                            <View style={[styles.noChartSmall, { backgroundColor: themeBorder }]}><ThemedText style={{color: themeSubText, fontSize: 12}}>Không có dữ liệu biểu đồ cho ca này</ThemedText></View>
                        )}
                    </View>

                    <View style={styles.statGrid}>
                      <View style={[styles.statItem, { backgroundColor: isStudentDark ? 'rgba(0, 245, 212, 0.1)' : '#eef2ff' }]}><ThemedText style={[styles.statVal, { color: isStudentDark ? '#00f5d4' : '#4f46e5' }]}>{Number(detailData.info.avg_focus || 0).toFixed(1)}%</ThemedText><ThemedText style={[styles.statLab, { color: themeSubText }]}>TẬP TRUNG</ThemedText></View>
                      <View style={[styles.statItem, { backgroundColor: isStudentDark ? 'rgba(245, 158, 11, 0.1)' : '#fff7ed' }]}><ThemedText style={[styles.statVal, { color: '#f59e0b' }]}>{detailData.info.phone_uses}</ThemedText><ThemedText style={[styles.statLab, { color: themeSubText }]}>DÙNG ĐT</ThemedText></View>
                      <View style={[styles.statItem, { backgroundColor: isStudentDark ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2' }]}><ThemedText style={[styles.statVal, { color: '#ef4444' }]}>{detailData.info.sleep_uses}</ThemedText><ThemedText style={[styles.statLab, { color: themeSubText }]}>NGỦ GẬT</ThemedText></View>
                      <View style={[styles.statItem, { backgroundColor: isStudentDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc' }]}><ThemedText style={[styles.statVal, { color: themeText }]}>{detailData.info.duration_minutes}</ThemedText><ThemedText style={[styles.statLab, { color: themeSubText }]}>PHÚT</ThemedText></View>
                    </View>

                    <ThemedText style={[styles.sectionHeading, { color: themeText }]}><Ionicons name="images-outline" size={16} color="#ef4444" /> Album hình ảnh minh chứng</ThemedText>
                    <View style={styles.albumGrid}>
                        {detailData.album.length > 0 ? (detailData.album.map((item, index) => (
                                <View key={index} style={[styles.albumItem, { backgroundColor: themeBorder }]}><Image source={{ uri: getFullUrl(item.image_path) }} style={styles.albumImg} /><View style={styles.albumOverlay}><ThemedText style={styles.albumBehavior}>{item.behavior === 'using_phone' ? 'Điện thoại' : 'Ngủ gật'}</ThemedText><ThemedText style={styles.albumTime}>{item.time}</ThemedText></View></View>
                        ))) : (<ThemedText style={[styles.emptyAlbumText, { color: themeSubText }]}>Không ghi nhận hành vi mất tập trung nào trong ca học này.</ThemedText>)}
                    </View>

                    <TouchableOpacity 
                        style={[styles.exportBtn, isStudentDark && { backgroundColor: '#00f5d4' }]} 
                        onPress={() => Linking.openURL(getFullUrl(`/api/export/violations/${detailData.info.id}`))}
                    >
                      <Ionicons name="document-text" size={20} color={isStudentDark ? '#030f16' : '#fff'} />
                      <ThemedText style={[styles.exportBtnText, isStudentDark && { color: '#030f16' }]}>XUẤT BÁO CÁO EXCEL</ThemedText>
                    </TouchableOpacity>

                    <View style={{ height: 60 }} />

                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 20, paddingBottom: 100 },
  listTitle: { marginBottom: 16, color: '#1e293b', fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, height: 50, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },
  dateFilterBtn: { width: 50, height: 50, backgroundColor: '#fff', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginLeft: 12, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },
  dateFilterActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  activeFilters: { flexDirection: 'row', marginBottom: 16 },
  dateChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#c7d2fe' },
  dateChipText: { fontSize: 13, color: '#4f46e5', fontWeight: '700', marginHorizontal: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#1e293b', marginLeft: 10, fontWeight: '500' },
  filterPills: { flexDirection: 'row', marginBottom: 20 },
  pill: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', marginRight: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  pillActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  pillText: { fontSize: 13, color: '#64748b', fontWeight: '700' },
  pillTextActive: { color: '#fff' },
  sessionCard: { backgroundColor: '#fff', borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 },
  ongoingCard: { borderColor: '#10b981', borderWidth: 2 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sessionIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#eef2ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  ongoingIcon: { backgroundColor: '#ecfdf5' },
  sessionMainInfo: { flex: 1 },
  sessionTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  sessionSpace: { fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: '500' },
  focusBadge: { alignItems: 'center', backgroundColor: '#f8fafc', padding: 8, borderRadius: 12, minWidth: 60 },
  focusValue: { fontSize: 16, fontWeight: '900' },
  focusLabel: { fontSize: 8, color: '#94a3b8', fontWeight: '800', marginTop: 2 },
  sessionFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: 12, color: '#64748b', marginLeft: 6, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { marginTop: 16, color: '#94a3b8', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', height: '85%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 4 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  modalHeaderTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b', lineHeight: 24 },
  modalHeaderSub: { fontSize: 11, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
  closeBtn: { width: 36, height: 36, backgroundColor: '#f1f5f9', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  modalLoading: { flex: 1, height: 200, justifyContent: 'center', alignItems: 'center' },
  modalBody: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  detailInfoBox: { marginBottom: 20 },
  detailSubject: { fontSize: 20, fontWeight: '900', color: '#1e293b' },
  detailRoom: { fontSize: 13, color: '#64748b', fontWeight: '600', marginTop: 4 },
  chartBox: { marginBottom: 20 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  statItem: { width: '48%', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  statVal: { fontSize: 20, fontWeight: '900' },
  statLab: { fontSize: 10, fontWeight: '800', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionHeading: { fontSize: 13, fontWeight: '900', color: '#1e293b', marginBottom: 12, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  noChartSmall: { height: 100, backgroundColor: '#f8fafc', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  albumItem: { width: '48%', height: 130, borderRadius: 18, overflow: 'hidden', marginBottom: 14, backgroundColor: '#f8fafc' },
  albumImg: { width: '100%', height: '100%' },
  albumOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 6 },
  albumBehavior: { color: '#fff', fontSize: 11, fontWeight: '800' },
  albumTime: { color: '#cbd5e1', fontSize: 9, marginTop: 2 },
  emptyAlbumText: { color: '#94a3b8', fontStyle: 'italic', fontSize: 13, textAlign: 'center', width: '100%', marginTop: 15 },
  exportBtn: { backgroundColor: '#10b981', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 16, marginTop: 20, shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  exportBtnText: { color: '#fff', fontSize: 14, fontWeight: '900', marginLeft: 8 },
});
