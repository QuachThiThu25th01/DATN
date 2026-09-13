import axios from 'axios';
import Constants from 'expo-constants';

import { Platform } from 'react-native';

export const DEFAULT_LAN_IP = '10.50.1.15';

// Tự động lấy IP máy tính từ cấu hình Expo hoặc Web Browser
const debuggerHost = Constants.expoConfig?.hostUri || '';
const expoIP = debuggerHost.split(':')[0];

const getApiHost = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname) {
    return window.location.hostname;
  }
  if (expoIP && expoIP !== 'localhost' && expoIP !== '127.0.0.1') {
    return expoIP;
  }
  return DEFAULT_LAN_IP;
};

export const API_HOST = getApiHost();
export const BASE_URL = `http://${API_HOST}:5000`;


const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // Quan trọng để giữ session cookie từ Flask
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getFullUrl = (path: string | null | undefined) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  
  // Tránh bị tslayer (double slash)
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // Encode URI to handle spaces and unicode, and manually handle '#' for filenames
  const encodedPath = encodeURI(cleanPath).replace(/#/g, '%23');
  
  return `${BASE_URL}${encodedPath}`;
};

export default apiClient;




























































































































































