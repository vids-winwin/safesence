"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import { useDarkMode } from "../DarkModeContext";
import apiClient from "../lib/apiClient";
import { getStatusDisplay, isAlertStatus, isOfflineStatus } from "../lib/statusUtils";
import { User, Settings, LogOut, ChevronDown } from "lucide-react";

// Removed Supabase client after migration

/* ===== Simple helpers ===== */
const fToC = (v) => (v == null ? null : (v - 32) * 5 / 9);
const cToF = (v) => (v == null ? null : v * 9 / 5 + 32);

// Axis configs
const axisConfigTemp = (unit) =>
  unit === "F"
    ? { min: -25, max: 100, step: 25, title: "Temperature Sensors", tickFmt: (n) => `${n}°F` }
    : { min: -30, max: 40, step: 10, title: "Temperature Sensors", tickFmt: (n) => `${n}°C` };
const axisConfigHum = () => ({ min: -25, max: 100, step: 25, title: "Humidity Sensors", tickFmt: (n) => `${n}%` });

const fmtDate = (d, tz, withTime = true) => {
  const opts = withTime
    ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz }
    : { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz };
  try {
    return new Intl.DateTimeFormat("en-US", opts).format(new Date(d));
  } catch {
    return new Date(d).toLocaleString();
  }
};

// Respect user prefs when filtering what to show
const visibleItems = (items, filterType, selectedRole, prefs) =>
  items.filter((i) => {
    // Type filtering
    if (filterType === "temperature") {
      if (!prefs.showTemp || i.kind !== "temperature") return false;
    } else if (filterType === "humidity") {
      if (!prefs.showHumidity || i.kind !== "humidity") return false;
    } else {
      // ALL type
      if (i.kind === "temperature" && !prefs.showTemp) return false;
      if (i.kind === "humidity" && !prefs.showHumidity) return false;
    }
    
    // Role filtering
    if (selectedRole === "owned") {
      return i.access_role === "owner";
    } else if (selectedRole === "admin") {
      return i.access_role === "admin";
    } else if (selectedRole === "viewer") {
      return i.access_role === "viewer";
    }
    // ALL role - no additional filtering
    
    return true;
  });

export default function Dashboard() {
  const router = useRouter();
  const { darkMode, toggleDarkMode, isInitialized } = useDarkMode();

  const [username, setUsername] = useState("User");
  const [currentUserEmail, setCurrentUserEmail] = useState(null);
  const [error, setError] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  
  // Profile dropdown state
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);
  
  // Alert severity filter
  const [alertFilter, setAlertFilter] = useState("all"); // 'all' | 'critical' | 'warning' | 'info'

  // Last update timestamp for "Last updated" display
  const [lastUpdateTs, setLastUpdateTs] = useState(null);

  // Preferences (from user_preferences)
  const [prefs, setPrefs] = useState({
    unit: "F", // Always F for now
    tz: "America/Anchorage",
    showTemp: true,
    showHumidity: true,
    showSensors: true,
    showUsers: true,
    showAlerts: true,
  });

  // Data
  const [data, setData] = useState({
    notifications: 0,
    users: null, // DB-driven; hide card when not provided
    items: [], // unified (temperature + humidity)
    sensors: { total: 0, error: 0, warning: 0, success: 0, disconnected: 0 },
    notificationsList: [],
  });

  // No thresholds state needed - using database status directly

  // Role filter: 'all' | 'owned' | 'admin' | 'viewer'
  const [selectedRole, setSelectedRole] = useState("all");

  // Hovered bar info for temperature and humidity charts
  const [hoveredTempBar, setHoveredTempBar] = useState(null);
  const [hoveredHumBar, setHoveredHumBar] = useState(null);

  // Notifications popup
  const [showNotifications, setShowNotifications] = useState(false);
  const popupRef = useRef(null);
  const notificationCardRef = useRef(null);

  /* ===== Session + preferences ===== */
  useEffect(() => {
    (async () => {
      try {
        // Check authentication
        const token = localStorage.getItem('auth-token');
        if (!token) {
          router.push("/login");
          return;
        }

        const response = await fetch('/api/verify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });

        if (!response.ok) {
          localStorage.removeItem('auth-token');
          router.push("/login");
          return;
        }

        const { user } = await response.json();
        setUsername(user?.email?.split("@")[0] || "User");
        setCurrentUserEmail(user?.email || null);

        // Get user preferences using API client
        try {
          const preferences = await apiClient.getUserPreferences();
          if (preferences) {
            const next = {
              unit: "F", // Always F for now
              tz: preferences.timeZone || "America/Anchorage",
              showTemp: !!preferences.showTemp,
              showHumidity: !!preferences.showHumidity,
              showSensors: !!preferences.showSensors,
              showUsers: !!preferences.showUsers,
              showAlerts: !!preferences.showAlerts || !!preferences.showNotifications,
            };
            setPrefs(next);
            if (!!preferences.darkMode !== darkMode) toggleDarkMode();
            if (preferences.username) {
              setUsername(String(preferences.username));
            }
          }
        } catch (prefError) {
          console.error('Failed to load preferences:', prefError);
        }
      } catch (err) {
        setError("Failed to verify session: " + (err?.message || String(err)));
        router.push("/login");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildNotifications = (items, tz) => {
    const list = [];
    let id = 1;
    items.forEach((it) => {
      if (isAlertStatus(it.status)) {
        const statusDisplay = getStatusDisplay(it.status);
        list.push({
          id: id++,
          title: `${statusDisplay.label} (${it.name})`,
          description: it.kind === "humidity" ? `Humidity: ${it.displayValue}` : `Temperature: ${it.displayValue}`,
          date: fmtDate(lastUpdateTs || Date.now(), tz, false),
          type: it.status === "alert" ? "error" : "warning",
          sensorId: it.sensor_id,
        });
      }
    });
    return list;
  };

  /* ===== Data loading function ===== */
  const loadDashboardData = async (showLoading = true, shouldSync = false) => {
    try {
      if (showLoading) setLoadingData(true);
      
      // Sync sensors from mqtt_consumer_test to sensors table if requested
      // (We sync less frequently to avoid performance issues)
      if (shouldSync) {
        // Use silent mode to avoid console errors - we handle failures gracefully
        await apiClient.syncSensors(true);
      }
      
      const sensorRows = await apiClient.getSensors();

        // No need to store thresholds - using database status directly

        // Use sensors.latest_temp directly; no additional latest lookup required

        const items = (sensorRows || [])
          .map((r) => {
            // Normalize sensor type: only allow 'temperature' or 'humidity', default to 'temperature'
            const rawType = (r.sensor_type || "").toLowerCase();
            const sType = rawType === "humidity" ? "humidity" : "temperature";
            const kind = sType === "humidity" ? "humidity" : "temperature";
            const name = r.sensor_name || r.sensor_id;
            const deviceName = r.device_name || r.device_id || 'Unknown Device';

            const raw = r.latest_temp != null ? Number(r.latest_temp) : null;

            let value = null;
            let displayValue = "--";
            let status = "unknown"; // Default to unknown instead of "Good"
            let color = "bg-gray-500"; // Default to gray instead of green
            let unit = prefs.unit;

                         if (kind === "temperature") {
               const sensorUnit = (r.metric || "F").toUpperCase() === "C" ? "C" : "F";
               // Convert to °F for display consistency
               const valueInF = raw != null ? (sensorUnit === "C" ? cToF(raw) : raw) : null;
               
               // Use status from database instead of calculating
               status = r.status || 'unknown';

               
               // Always display in Fahrenheit, rounded to whole number
               value = valueInF;
               displayValue = value != null ? `${Math.round(value)}°F` : `--°F`;
               
               // Store sensor unit for realtime updates
               unit = sensorUnit;
                          } else {
               unit = "%";
               // Humidity values are already in the correct unit (%)
               value = raw != null ? Number(raw) : null;
               // Use status from database instead of calculating
               status = r.status || 'unknown';

               displayValue = value != null ? `${value.toFixed(1)}%` : "--%";
             }

                         // Update color based on status from database
             const statusDisplay = getStatusDisplay(status);
             if (status === "alert") color = "bg-red-500";
             else if (status === "warning") color = "bg-[#FF9866]";
             else if (status === "offline") color = "bg-gray-500";
             else if (status === "unknown") color = "bg-gray-500";
             else color = "bg-[#98CC37]"; // ok status

            return {
               sensor_id: r.sensor_id,
               sensor_type: sType,
               kind, // 'temperature' | 'humidity'
               name,
               device_name: deviceName,
               device_id: r.device_id,
               unit,
               value,
               displayValue,
               status,
               color,
               approx_time: r.approx_time,
               lastFetchedTime: r.last_fetched_time,
               lastUpdated: r.updated_at || new Date().toISOString(),
               access_role: r.access_role || 'owner',
               // No thresholds needed - using database status
             };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        // Apply visibility for all items with role filtering
        const filtered = visibleItems(items, "all", selectedRole, prefs);

        const sensorsKPI = {
          total: filtered.length,
          error: filtered.filter((t) => t.status === "alert").length,
          warning: filtered.filter((t) => t.status === "warning").length,
          success: filtered.filter((t) => t.status === "ok").length,
          unconfigured: filtered.filter((t) => t.status === "offline" || t.status === "unknown").length,
          disconnected: filtered.filter((t) => t.value == null).length,
        };

        // Users KPI: unique users across all sensors' access lists (dedup by user_id/email)
        let usersCount = 0;
        try {
          const uniq = new Set();
          await Promise.all((sensorRows || []).map(async (r) => {
            try {
              const res = await apiClient.getSensorShares(r.sensor_id);
              const arr = res?.access || [];
              for (const a of arr) {
                const key = a.user_id ? String(a.user_id) : (a.email ? String(a.email).toLowerCase() : null);
                if (key) uniq.add(key);
              }
            } catch {}
          }));
          // Exclude current user by email if present
          if (currentUserEmail) uniq.delete(String(currentUserEmail).toLowerCase());
          usersCount = uniq.size;
        } catch {}

        const notificationsList = buildNotifications(filtered, prefs.tz);

        setData({
          notifications: notificationsList.length,
          users: usersCount,
          items, // keep full set; we filter at render time too
          sensors: sensorsKPI,
          notificationsList,
        });
        setLastUpdateTs(Date.now()); // Update timestamp on successful data load
        setLoadingData(false);
      } catch (err) {
        setError("Failed to fetch sensor data: " + (err?.message || String(err)));
        setLoadingData(false);
      }
    };

  /* ===== Fetch sensors + latest readings ===== */
  useEffect(() => {
    // Initial load with loading indicator and sync
    loadDashboardData(true, true);
    
    // Set up 15-second interval for seamless data updates
    const dataInterval = setInterval(() => {
      loadDashboardData(false, false); // Background updates without loading indicator, no sync
    }, 15000);
    
    // Set up 60-second interval for syncing from mqtt_consumer_test
    const syncInterval = setInterval(() => {
      loadDashboardData(false, true); // Background sync and data refresh
    }, 60000);
    
    // Cleanup intervals on unmount
    return () => {
      clearInterval(dataInterval);
      clearInterval(syncInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.unit, prefs.showUsers, prefs.tz, prefs.showTemp, prefs.showHumidity, selectedRole, currentUserEmail]);

  // Realtime updates removed (no Supabase client). Consider polling if needed.

  /* ===== UI helpers ===== */
  useEffect(() => {
    const handler = (e) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target) &&
        notificationCardRef.current &&
        !notificationCardRef.current.contains(e.target)
      ) {
        setShowNotifications(false);
      }
      // Close profile menu when clicking outside
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target)
      ) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const getInitials = (name) => name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  // Axes
  const axisTemp = axisConfigTemp(prefs.unit);
  const axisHum = axisConfigHum();

  // Get temperature and humidity items separately
  const tempItems = visibleItems(data.items, "temperature", selectedRole, prefs);
  const humItems = visibleItems(data.items, "humidity", selectedRole, prefs);
  
  // Combined items for KPI display
  const itemsVisible = [...tempItems, ...humItems];

  const H = 320;
  const ticks = (ax) => {
    const arr = [];
    for (let v = ax.max; v >= ax.min; v -= ax.step) arr.push(ax.tickFmt(v));
    return arr;
  };
  const toHeight = (item, axis) => {
    if (item.value == null) return 0;
    const clamped = Math.max(axis.min, Math.min(item.value, axis.max));
    return ((clamped - axis.min) / (axis.max - axis.min)) * H;
  };

  if (loadingData) {
    return (
      <div className={`flex min-h-screen ${darkMode ? "bg-slate-900 text-white" : "bg-gradient-to-br from-slate-50 to-blue-50 text-slate-800"}`}>
        <Sidebar />
        <main className="flex-1 p-8 flex items-center justify-center">
          <div className="text-center">
            <div className={`animate-spin h-16 w-16 rounded-full border-4 border-slate-200 border-t-blue-500 mx-auto ${darkMode ? 'border-slate-700 border-t-blue-400' : ''}`}></div>
            <p className={`mt-6 text-lg font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Loading dashboard…</p>
          </div>
        </main>
      </div>
    );
  }

  // Check if user has no devices/sensors (empty state)
  const hasNoData = itemsVisible.length === 0 && !loadingData;

     return (
     <div className={`flex min-h-screen ${darkMode ? "bg-slate-900 text-white" : "bg-gradient-to-br from-slate-50 to-blue-50 text-slate-800"}`}>
               <style jsx>{`
          @keyframes customBounce {
            0%, 50%, 100% {
              transform: translateX(-50%) translateY(0);
            }
            25%, 75% {
              transform: translateX(-50%) translateY(-8px);
            }
          }
        `}</style>
       <Sidebar />
       <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <h1 className={`text-3xl md:text-4xl font-bold ${darkMode ? "text-orange-400" : "text-orange-500"}`}>
              Dashboard
            </h1>
            <p className={`text-base mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
              Welcome back, <span className={`font-semibold ${darkMode ? "text-orange-400" : "text-orange-600"}`}>
                {username}
              </span>
            </p>
          </div>
          
          {/* Right side controls */}
          <div className="flex items-center space-x-3">
            {/* Profile dropdown */}
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-xl transition-all duration-200 ${
                  darkMode 
                    ? 'bg-slate-700 hover:bg-slate-600 text-white' 
                    : 'bg-white hover:bg-slate-50 text-slate-800 shadow-md border border-slate-200'
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center text-white text-sm font-bold shadow">
                  {getInitials(username)}
                </div>
                <span className={`hidden md:block text-sm ${darkMode ? "text-white" : "text-slate-800"}`}>
                  {username}
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
              </button>
              
              {showProfileMenu && (
                <div className={`absolute right-0 mt-2 w-56 rounded-xl shadow-2xl z-50 overflow-hidden ${
                  darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'
                }`}>
                  {/* User info header */}
                  <div className={`px-4 py-3 border-b ${darkMode ? 'border-slate-700 bg-slate-700/50' : 'border-slate-100 bg-slate-50'}`}>
                    <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                      {username}
                    </p>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {currentUserEmail}
                    </p>
                  </div>
                  
                  {/* Menu items */}
                  <div className="py-2">
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        router.push('/account');
                      }}
                      className={`w-full flex items-center px-4 py-2.5 text-sm transition-colors ${
                        darkMode 
                          ? 'text-slate-300 hover:bg-slate-700 hover:text-white' 
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <User className="w-4 h-4 mr-3" />
                      My Profile
                    </button>
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        router.push('/account#settings');
                      }}
                      className={`w-full flex items-center px-4 py-2.5 text-sm transition-colors ${
                        darkMode 
                          ? 'text-slate-300 hover:bg-slate-700 hover:text-white' 
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Settings className="w-4 h-4 mr-3" />
                      Account Settings
                    </button>
                  </div>
                  
                  {/* Logout */}
                  <div className={`border-t py-2 ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                    <button
                      onClick={async () => {
                        setShowProfileMenu(false);
                        try {
                          localStorage.removeItem('auth-token');
                        } catch {}
                        router.push("/login");
                      }}
                      className={`w-full flex items-center px-4 py-2.5 text-sm transition-colors text-red-500 hover:bg-red-50 ${
                        darkMode ? 'hover:bg-red-900/20' : ''
                      }`}
                    >
                      <LogOut className="w-4 h-4 mr-3" />
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <p className="text-red-500 text-center mb-4">{error}</p>}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          {loadingData && (
            <div className={`rounded-2xl p-8 shadow-xl text-center col-span-full ${darkMode ? 'bg-slate-800 text-white' : 'bg-white shadow-2xl'}`}>
              <div className="flex items-center justify-center">
                <div className={`animate-spin h-12 w-12 rounded-full border-4 border-slate-200 border-t-blue-500 ${darkMode ? 'border-slate-700 border-t-blue-400' : ''}`}></div>
              </div>
              <p className={`mt-4 text-lg font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Loading latest data…</p>
            </div>
          )}
          {prefs.showAlerts && (
            <div className={`rounded-2xl p-8 shadow-xl text-center relative transition-all duration-300 hover:shadow-2xl hover:scale-105 z-20 ${darkMode ? "bg-slate-800 text-white border border-slate-700" : "bg-white shadow-2xl border border-slate-100"}`}>
              <div className="cursor-pointer" onClick={() => setShowNotifications(!showNotifications)} ref={notificationCardRef}>
                <div className={`flex items-center justify-center w-20 h-20 bg-gradient-to-r from-green-400 to-emerald-500 rounded-2xl mb-6 mx-auto shadow-lg`}>
                  <span className="text-3xl">🔔</span>
                 </div>
                <p className={`text-slate-600 text-lg font-medium mb-2 ${darkMode ? "text-slate-300" : ""}`}>Notifications</p>
                <p className={`text-4xl font-bold text-slate-800 mb-2 ${darkMode ? "text-white" : ""}`}>{data.notifications}</p>
                <div className="flex items-center justify-center">
                  <div className={`w-3 h-3 bg-red-500 rounded-full mr-2 ${darkMode ? "bg-red-400" : ""}`}></div>
                  <span className={`text-red-500 text-sm font-medium ${darkMode ? "text-red-400" : ""}`}>{data.notifications > 0 ? "Unread" : "All Clear"}</span>
                </div>
              </div>
                             {showNotifications && (
                 <div ref={popupRef} className={`absolute top-full left-1/2 -translate-x-1/2 mt-4 w-96 bg-white rounded-2xl shadow-2xl z-[999999] border border-slate-200 ${darkMode ? "bg-slate-800 border-slate-700 text-white" : ""}`}>
                  <div className="p-6">
                    <h4 className={`font-bold text-xl text-slate-800 mb-4 ${darkMode ? "text-white" : ""}`}>Notifications</h4>
                    
                    {/* Severity Filter */}
                    <div className="flex gap-2 mb-4 flex-wrap">
                      {[
                        { key: 'all', label: 'All', color: 'bg-slate-500' },
                        { key: 'error', label: 'Critical', color: 'bg-red-500' },
                        { key: 'warning', label: 'Warning', color: 'bg-yellow-500' },
                        { key: 'info', label: 'Info', color: 'bg-blue-500' }
                      ].map(({ key, label, color }) => (
                        <button
                          key={key}
                          onClick={(e) => {
                            e.stopPropagation();
                            setAlertFilter(key);
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                            alertFilter === key 
                              ? `${color} text-white shadow-md` 
                              : darkMode 
                                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {label}
                          {key !== 'all' && (
                            <span className="ml-1">
                              ({data.notificationsList.filter(n => 
                                key === 'error' ? n.type === 'error' : 
                                key === 'warning' ? n.type === 'warning' : 
                                n.type === 'info'
                              ).length})
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    
                    {(() => {
                      const filteredNotifications = alertFilter === 'all' 
                        ? data.notificationsList 
                        : data.notificationsList.filter(n => n.type === alertFilter);
                      
                      return filteredNotifications.length ? (
                        <div className="max-h-80 overflow-y-auto space-y-3">
                          {filteredNotifications.map((n) => (
                            <div key={n.id} className={`flex items-start justify-between p-4 bg-slate-50 rounded-xl ${darkMode ? "bg-slate-700 text-white" : ""} ${n.type === "error" ? "border-l-4 border-red-500" : n.type === "warning" ? "border-l-4 border-yellow-500" : "border-l-4 border-blue-500"} shadow-sm`}>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    n.type === 'error' ? 'bg-red-100 text-red-700' :
                                    n.type === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-blue-100 text-blue-700'
                                  }`}>
                                    {n.type === 'error' ? 'Critical' : n.type === 'warning' ? 'Warning' : 'Info'}
                                  </span>
                                </div>
                                <p className={`text-slate-700 text-base font-semibold ${darkMode ? "text-white" : ""}`}>{n.title}</p>
                                {n.description && <p className={`text-slate-600 text-sm ${darkMode ? "text-slate-300" : ""}`}>{n.description}</p>}
                                <p className={`text-slate-500 text-xs mt-1 ${darkMode ? "text-slate-400" : ""}`}>{n.date}</p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rest = data.notificationsList.filter((x) => x.id !== n.id);
                                  setData((prev) => ({ ...prev, notificationsList: rest, notifications: rest.length }));
                                }}
                                className={`text-slate-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-all duration-200 ml-3 ${darkMode ? "hover:text-red-400 hover:bg-red-900/30" : ""}`}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className={`text-slate-500 text-base text-center py-8 ${darkMode ? "text-slate-400" : ""}`}>
                          {alertFilter === 'all' ? 'No new notifications.' : `No ${alertFilter} notifications.`}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {prefs.showSensors && (
            <div 
              className={`rounded-2xl p-8 shadow-xl text-center transition-all duration-300 hover:shadow-2xl hover:scale-105 cursor-pointer ${darkMode ? "bg-slate-800 text-white border border-slate-700" : "bg-white shadow-2xl border border-slate-100"}`}
              onClick={() => router.push('/alerts')}
            >
              <div className={`flex items-center justify-center w-20 h-20 bg-gradient-to-r from-blue-400 to-cyan-500 rounded-2xl mb-6 mx-auto shadow-lg`}>
                <span className="text-3xl">📶</span>
               </div>
              <p className={`text-slate-600 text-lg font-medium mb-2 ${darkMode ? "text-slate-300" : ""}`}>Sensors</p>
              {(() => {
                const kpiItems = itemsVisible;
                return (
                  <>
                    <p className={`text-4xl font-bold text-slate-800 mb-4 ${darkMode ? "text-white" : ""}`}>{kpiItems.length}</p>
                    <div className="flex items-center justify-center space-x-4 text-sm">
                      <div className="flex items-center">
                        <div className={`w-3 h-3 bg-red-500 rounded-full mr-2 ${darkMode ? "bg-red-400" : ""}`}></div>
                        <span className={`text-red-500 font-semibold ${darkMode ? "text-red-400" : ""}`}>
                          {kpiItems.filter((t) => t.status === "alert").length}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <div className={`w-3 h-3 bg-yellow-500 rounded-full mr-2 ${darkMode ? "bg-yellow-400" : ""}`}></div>
                        <span className={`text-yellow-500 font-semibold ${darkMode ? "text-yellow-400" : ""}`}>
                          {kpiItems.filter((t) => t.status === "warning").length}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <div className={`w-3 h-3 bg-green-500 rounded-full mr-2 ${darkMode ? "bg-green-400" : ""}`}></div>
                        <span className={`text-green-500 font-semibold ${darkMode ? "text-green-400" : ""}`}>
                          {kpiItems.filter((t) => t.status === "ok").length}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <div className={`w-3 h-3 bg-slate-500 rounded-full mr-2 ${darkMode ? "bg-slate-400" : ""}`}></div>
                        <span className={`text-slate-500 font-semibold ${darkMode ? "text-slate-400" : ""}`}>
                          {kpiItems.filter((t) => t.status === "offline" || t.status === "unknown").length}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className={`mr-2 text-sm ${darkMode ? "text-slate-300" : "text-slate-500"}`}>✖</span>
                        <span className={`font-semibold ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
                          {kpiItems.filter((t) => t.value == null).length}
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {prefs.showUsers && data.users != null && (
            <div className={`rounded-2xl p-8 shadow-xl text-center transition-all duration-300 hover:shadow-2xl hover:scale-105 ${darkMode ? "bg-slate-800 text-white border border-slate-700" : "bg-white shadow-2xl border border-slate-100"}`}>
              <div className={`flex items-center justify-center w-20 h-20 bg-gradient-to-r from-purple-400 to-pink-500 rounded-2xl mb-6 mx-auto shadow-lg`}>
                <span className="text-3xl">👥</span>
               </div>
              <p className={`text-slate-600 text-lg font-medium mb-2 ${darkMode ? "text-slate-300" : ""}`}>Users</p>
              <p className={`text-4xl font-bold text-slate-800 mb-2 ${darkMode ? "text-white" : ""}`}>{data.users}</p>
            </div>
          )}
        </div>

        {/* Empty State or Dashboard Content */}
        {hasNoData ? (
          <div className={`rounded-3xl p-16 shadow-xl text-center ${darkMode ? "bg-slate-800 border border-slate-700" : "bg-white shadow-2xl border border-slate-100"}`}>
            <div className={`flex items-center justify-center w-32 h-32 bg-gradient-to-r from-blue-400 to-cyan-500 rounded-full mb-8 mx-auto shadow-lg`}>
              <span className="text-6xl">📡</span>
            </div>
            <h2 className={`text-3xl font-bold mb-4 ${darkMode ? "text-white" : "text-slate-800"}`}>
              Welcome to SafeSense!
            </h2>
            <p className={`text-lg mb-8 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
              You do not have any devices or sensors yet. Get started by adding your first device.
            </p>
            <button
              onClick={() => router.push('/devices/add')}
              className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 shadow-lg hover:shadow-xl hover:scale-105`}
            >
              Add Your First Device
            </button>
            <p className={`text-sm mt-6 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              Once you add a device, your dashboard will show real-time sensor data here.
            </p>
          </div>
        ) : (
          <>
            {/* Role Filter */}
            <div className="flex justify-end items-center mb-6">
              <div className="flex items-center gap-3">
                <label className={`text-sm font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Role Filter:</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className={`border-2 rounded-xl px-4 py-2 font-medium transition-all duration-200 ${darkMode ? "bg-slate-700 text-white border-slate-600 hover:border-slate-500" : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"}`}
                >
                  <option value="all">All</option>
                  <option value="owned">Owned</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>

            {/* Temperature Chart */}
            {prefs.showTemp && (
              <div className={`rounded-2xl shadow-2xl p-8 mb-10 ${darkMode ? "bg-slate-800 text-white border border-slate-700" : "bg-white border border-slate-100"}`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className={`text-2xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
                    {axisTemp.title}
                  </h3>
                  <div className={`text-sm px-3 py-2 rounded-lg ${darkMode ? "text-slate-300 bg-slate-700" : "text-slate-500 bg-slate-100"}`}>
                    Last updated: <span suppressHydrationWarning className="font-semibold">{lastUpdateTs ? fmtDate(lastUpdateTs, prefs.tz, true) : "—"}</span>
                  </div>
                </div>

                {/* Hover Info - Above Graph (only visible when hovering) */}
                <div className={`mb-6 h-10 flex items-center justify-center transition-all duration-300 ${hoveredTempBar ? "opacity-100" : "opacity-0"}`}>
                  {hoveredTempBar && (
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${
                        hoveredTempBar.status === "alert" ? "bg-red-500" 
                        : hoveredTempBar.status === "warning" ? "bg-yellow-500"
                        : hoveredTempBar.status === "offline" || hoveredTempBar.status === "unknown" ? "bg-slate-400"
                        : "bg-green-500"
                      }`}></div>
                      <span className={`font-semibold ${darkMode ? "text-white" : "text-slate-800"}`}>{hoveredTempBar.name}</span>
                      <span className={`${darkMode ? "text-slate-400" : "text-slate-400"}`}>•</span>
                      <span className={`font-medium ${
                        hoveredTempBar.status === "alert" ? "text-red-500" 
                        : hoveredTempBar.status === "warning" ? "text-yellow-500"
                        : hoveredTempBar.status === "offline" || hoveredTempBar.status === "unknown" ? "text-slate-500"
                        : "text-green-500"
                      }`}>
                        {hoveredTempBar.status === "ok" ? "Good" : hoveredTempBar.status === "alert" ? "Needs Attention" : hoveredTempBar.status}
                      </span>
                      <span className={`${darkMode ? "text-slate-400" : "text-slate-400"}`}>•</span>
                      <span className={`font-bold text-lg ${darkMode ? "text-white" : "text-slate-800"}`}>
                        {hoveredTempBar.status === "offline" || hoveredTempBar.status === "unknown" ? "NA" : hoveredTempBar.displayValue}
                      </span>
                    </div>
                  )}
                </div>

                {/* Chart area (grid/axes always render) */}
                <div className="relative">
                  <div className="flex items-start">
                    {/* Left Y-axis */}
                    <div className="flex flex-col w-16 mr-4 flex-shrink-0">
                      <div className="h-6"></div>
                      <div className="relative h-80">
                        <div className={`absolute inset-0 flex flex-col justify-between text-sm items-end pr-3 font-semibold ${
                          darkMode ? "text-slate-300" : "text-slate-600"
                        }`}>
                          {ticks(axisTemp).map((t, i) => (
                            <span key={i} className="transform -translate-y-1/2">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Main plot - expanded to full width */}
                    <div className="flex-1 relative">
                      {/* Grid */}
                      <div className={`absolute inset-0 h-80 rounded-xl border shadow-inner ${darkMode ? "bg-gradient-to-b from-slate-700 to-slate-800 border-slate-600" : "bg-gradient-to-b from-slate-50 to-white border-slate-200"}`}>
                        <div className="h-full flex flex-col justify-between">
                          {[...Array(6)].map((_, i) => (
                            <div
                              key={i}
                              className={`border-t w-full ${
                                i === 0 || i === 5 ? "border-slate-400 border-t-2" : "border-slate-200"
                              } ${darkMode ? "border-slate-600" : ""}`}
                            />
                          ))}
                        </div>
                        <div className="absolute inset-0">
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${darkMode ? "bg-slate-500" : "bg-slate-400"}`}></div>
                          <div className={`absolute right-0 top-0 bottom-0 w-1 ${darkMode ? "bg-slate-500" : "bg-slate-400"}`}></div>
                        </div>
                      </div>

                      {/* Bars (scrollable container) */}
                      <div className="relative h-80 overflow-x-auto overflow-y-hidden" onMouseLeave={() => setHoveredTempBar(null)}>
                        <div className={`absolute bottom-0 left-0 flex items-end h-full px-4 gap-3 ${tempItems.length > 8 ? "min-w-max" : "w-full justify-around"}`}>
                          {tempItems.length === 0 ? (
                            <div className="text-center w-full text-lg text-slate-500 mt-20 opacity-75 font-medium">No temperature sensors to display.</div>
                          ) : (
                            [...tempItems].sort((a, b) => a.name.localeCompare(b.name)).map((it, i) => {
                              const h = toHeight(it, axisTemp);
                              return (
                                <div 
                                  key={i} 
                                  className="flex flex-col items-center relative" 
                                  style={{ minWidth: "40px", maxWidth: "60px" }}
                                  onMouseEnter={() => setHoveredTempBar(it)}
                                  onMouseLeave={() => setHoveredTempBar(null)}
                                >
                                  {it.value != null ? (
                                    <div
                                      className={`relative w-8 rounded-t-lg shadow-lg transition-all duration-300 cursor-pointer hover:w-10 hover:shadow-xl ${it.color} ${
                                        it.status === "alert" ? "animate-pulse" : ""
                                      } ${hoveredTempBar?.sensor_id === it.sensor_id ? "w-10 shadow-xl ring-2 ring-white" : ""}`}
                                      style={{
                                        height: `${Math.max(h, 4)}px`,
                                        background:
                                           it.status === "alert"
                                            ? "linear-gradient(to top, #dc2626, #ef4444, #f87171)"
                                             : it.status === "warning"
                                            ? "linear-gradient(to top, #fbbf24, #fcd34d, #fde68a)"
                                             : it.status === "offline" || it.status === "unknown"
                                            ? "linear-gradient(to top, #6b7280, #9ca3af, #d1d5db)"
                                            : "linear-gradient(to top, #10b981, #34d399, #6ee7b7)",
                                        boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
                                      }}
                                    >
                                    </div>
                                  ) : (
                                    <div 
                                      className={`bg-gradient-to-t from-slate-400 to-slate-300 w-8 rounded-t-lg opacity-60 shadow-lg cursor-pointer hover:w-10 ${hoveredTempBar?.sensor_id === it.sensor_id ? "w-10 ring-2 ring-white" : ""}`} 
                                      style={{ height: "4px" }}
                                    >
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex justify-center mt-8 space-x-8 text-sm">
                     <div className="flex items-center">
                      <div className="w-4 h-4 bg-gradient-to-r from-green-400 to-green-500 rounded-lg mr-3 shadow-sm"></div>
                      <span className={`font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Good</span>
                     </div>
                     <div className="flex items-center">
                      <div className="w-4 h-4 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-lg mr-3 shadow-sm"></div>
                      <span className={`font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Warning</span>
                     </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-gradient-to-r from-red-500 to-red-600 rounded-lg mr-3 shadow-sm"></div>
                      <span className={`font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Needs Attention</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-gradient-to-r from-slate-400 to-slate-500 rounded-lg mr-3 shadow-sm"></div>
                      <span className={`font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Offline</span>
                    </div>
                  </div>

                  {/* Temperature Table */}
                  <div className="mt-8">
                    <h4 className={`text-xl font-bold mb-6 ${darkMode ? "text-white" : "text-slate-900"}`}>Temperature Sensor Details</h4>
                    <div className={`overflow-x-auto rounded-xl border shadow-lg ${
                      darkMode ? "border-slate-700" : "border-slate-200"
                    }`}>
                      <table className={`w-full text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                        <thead className={darkMode ? "bg-slate-800" : "bg-slate-50"}>
                          <tr className={`border-b-2 ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200"}`}>
                            <th className={`text-left py-4 px-6 font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Sensor</th>
                            <th className={`text-left py-4 px-6 font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Reading</th>
                            <th className={`text-left py-4 px-6 font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Status</th>
                            <th className={`text-left py-4 px-6 font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Last Updated</th>
                            <th className={`text-left py-4 px-6 font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tempItems.map((it, i) => (
                            <tr key={i} className={`border-b hover:bg-slate-50 transition-colors duration-200 ${darkMode ? "border-slate-700 hover:bg-slate-800" : "border-slate-100"}`}>
                              <td className="py-4 px-6 font-semibold">
                                <span className={darkMode ? "text-slate-200" : "text-slate-800"}>{it.name}</span>
                                <span className={`ml-3 text-xs px-3 py-1 rounded-full align-middle font-medium ${
                                  it.access_role === 'owner'
                                    ? 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border border-green-300'
                                    : it.access_role === 'admin'
                                    ? 'bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 border border-yellow-300'
                                    : 'bg-gradient-to-r from-slate-100 to-slate-200 text-slate-800 border border-slate-300'
                                }`}>
                                  {it.access_role}
                                </span>
                              </td>
                              <td className="py-4 px-6">
                                 <span
                                  className={`text-lg font-bold ${
                                    it.status === "alert" ? "text-red-600" : it.status === "warning" ? "text-yellow-600" : it.status === "offline" || it.status === "unknown" ? "text-slate-500" : "text-green-600"
                                   }`}
                                 >
                                   {it.status === "offline" || it.status === "unknown" ? "NA" : it.displayValue}
                                 </span>
                               </td>
                              <td className="py-4 px-6">
                                <span
                                  className={`px-3 py-2 rounded-full text-sm font-semibold shadow-sm ${
                                     it.status === "alert"
                                      ? "bg-gradient-to-r from-red-100 to-red-200 text-red-800 border border-red-300"
                                       : it.status === "warning"
                                      ? "bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 border border-yellow-300"
                                       : it.status === "offline" || it.status === "unknown"
                                      ? "bg-gradient-to-r from-slate-100 to-slate-200 text-slate-800 border border-slate-300"
                                      : "bg-gradient-to-r from-green-100 to-green-200 text-green-800 border border-green-300"
                                  }`}
                                 >
                                  {it.status}
                                </span>
                              </td>
                              <td className={`py-4 px-6 font-medium ${darkMode ? "text-slate-400" : "text-slate-600"}`}>{
                                 it.lastFetchedTime
                                   ? fmtDate(it.lastFetchedTime, prefs.tz, true)
                                   : "No data"
                               }</td>
                              <td className="py-4 px-6">
                                <div className="flex items-center gap-2">
                                  {(it.access_role === 'owner' || it.access_role === 'admin') && (
                                    <>
                                      <button
                                        onClick={() => router.push(`/teams?sensor=${it.sensor_id}`)}
                                        className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                          darkMode
                                            ? 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 border border-blue-800'
                                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                                        }`}
                                        title="Assign users to this sensor"
                                      >
                                        Assign
                                      </button>
                                      <button
                                        className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                          darkMode
                                            ? 'bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 border border-yellow-800'
                                            : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200'
                                        }`}
                                        title="Mute alerts for this sensor"
                                      >
                                        Mute
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => router.push(`/devices?sensor=${it.sensor_id}`)}
                                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                      darkMode
                                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                                    }`}
                                    title="View sensor details"
                                  >
                                    View
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Humidity Chart */}
            {prefs.showHumidity && (
              <div className={`rounded-2xl shadow-2xl p-8 mb-10 ${darkMode ? "bg-slate-800 text-white border border-slate-700" : "bg-white border border-slate-100"}`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className={`text-2xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
                    {axisHum.title}
                  </h3>
                  <div className={`text-sm px-3 py-2 rounded-lg ${darkMode ? "text-slate-300 bg-slate-700" : "text-slate-500 bg-slate-100"}`}>
                    Last updated: <span suppressHydrationWarning className="font-semibold">{lastUpdateTs ? fmtDate(lastUpdateTs, prefs.tz, true) : "—"}</span>
                  </div>
                </div>

                {/* Hover Info - Above Graph (only visible when hovering) */}
                <div className={`mb-6 h-10 flex items-center justify-center transition-all duration-300 ${hoveredHumBar ? "opacity-100" : "opacity-0"}`}>
                  {hoveredHumBar && (
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${
                        hoveredHumBar.status === "alert" ? "bg-red-500" 
                        : hoveredHumBar.status === "warning" ? "bg-yellow-500"
                        : hoveredHumBar.status === "offline" || hoveredHumBar.status === "unknown" ? "bg-slate-400"
                        : "bg-green-500"
                      }`}></div>
                      <span className={`font-semibold ${darkMode ? "text-white" : "text-slate-800"}`}>{hoveredHumBar.name}</span>
                      <span className={`${darkMode ? "text-slate-400" : "text-slate-400"}`}>•</span>
                      <span className={`font-medium ${
                        hoveredHumBar.status === "alert" ? "text-red-500" 
                        : hoveredHumBar.status === "warning" ? "text-yellow-500"
                        : hoveredHumBar.status === "offline" || hoveredHumBar.status === "unknown" ? "text-slate-500"
                        : "text-green-500"
                      }`}>
                        {hoveredHumBar.status === "ok" ? "Good" : hoveredHumBar.status === "alert" ? "Needs Attention" : hoveredHumBar.status}
                      </span>
                      <span className={`${darkMode ? "text-slate-400" : "text-slate-400"}`}>•</span>
                      <span className={`font-bold text-lg ${darkMode ? "text-white" : "text-slate-800"}`}>
                        {hoveredHumBar.status === "offline" || hoveredHumBar.status === "unknown" ? "NA" : (hoveredHumBar.value != null ? `${hoveredHumBar.value.toFixed(1)}%` : "--%")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Chart area (grid/axes always render) */}
                <div className="relative">
                  <div className="flex items-start">
                    {/* Left Y-axis */}
                    <div className="flex flex-col w-16 mr-4 flex-shrink-0">
                      <div className="h-6"></div>
                      <div className="relative h-80">
                        <div className={`absolute inset-0 flex flex-col justify-between text-sm items-end pr-3 font-semibold ${
                          darkMode ? "text-slate-300" : "text-slate-600"
                        }`}>
                          {ticks(axisHum).map((t, i) => (
                            <span key={i} className="transform -translate-y-1/2">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Main plot - expanded to full width */}
                    <div className="flex-1 relative">
                      {/* Grid */}
                      <div className={`absolute inset-0 h-80 rounded-xl border shadow-inner ${darkMode ? "bg-gradient-to-b from-slate-700 to-slate-800 border-slate-600" : "bg-gradient-to-b from-slate-50 to-white border-slate-200"}`}>
                        <div className="h-full flex flex-col justify-between">
                          {[...Array(6)].map((_, i) => (
                            <div
                              key={i}
                              className={`border-t w-full ${
                                i === 0 || i === 5 ? "border-slate-400 border-t-2" : "border-slate-200"
                              } ${darkMode ? "border-slate-600" : ""}`}
                            />
                          ))}
                        </div>
                        <div className="absolute inset-0">
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${darkMode ? "bg-slate-500" : "bg-slate-400"}`}></div>
                          <div className={`absolute right-0 top-0 bottom-0 w-1 ${darkMode ? "bg-slate-500" : "bg-slate-400"}`}></div>
                        </div>
                      </div>

                      {/* Bars (scrollable container) */}
                      <div className="relative h-80 overflow-x-auto overflow-y-hidden" onMouseLeave={() => setHoveredHumBar(null)}>
                        <div className={`absolute bottom-0 left-0 flex items-end h-full px-4 gap-3 ${humItems.length > 8 ? "min-w-max" : "w-full justify-around"}`}>
                          {humItems.length === 0 ? (
                            <div className="text-center w-full text-lg text-slate-500 mt-20 opacity-75 font-medium">No humidity sensors to display.</div>
                          ) : (
                            [...humItems].sort((a, b) => a.name.localeCompare(b.name)).map((it, i) => {
                              const h = toHeight(it, axisHum);
                              return (
                                <div 
                                  key={i} 
                                  className="flex flex-col items-center relative" 
                                  style={{ minWidth: "40px", maxWidth: "60px" }}
                                  onMouseEnter={() => setHoveredHumBar(it)}
                                  onMouseLeave={() => setHoveredHumBar(null)}
                                >
                                  {it.value != null ? (
                                    <div
                                      className={`relative w-8 rounded-t-lg shadow-lg transition-all duration-300 cursor-pointer hover:w-10 hover:shadow-xl ${it.color} ${
                                        it.status === "alert" ? "animate-pulse" : ""
                                      } ${hoveredHumBar?.sensor_id === it.sensor_id ? "w-10 shadow-xl ring-2 ring-white" : ""}`}
                                      style={{
                                        height: `${Math.max(h, 4)}px`,
                                        background:
                                           it.status === "alert"
                                            ? "linear-gradient(to top, #dc2626, #ef4444, #f87171)"
                                             : it.status === "warning"
                                            ? "linear-gradient(to top, #fbbf24, #fcd34d, #fde68a)"
                                             : it.status === "offline" || it.status === "unknown"
                                            ? "linear-gradient(to top, #6b7280, #9ca3af, #d1d5db)"
                                            : "linear-gradient(to top, #10b981, #34d399, #6ee7b7)",
                                        boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
                                      }}
                                    >
                                    </div>
                                  ) : (
                                    <div 
                                      className={`bg-gradient-to-t from-slate-400 to-slate-300 w-8 rounded-t-lg opacity-60 shadow-lg cursor-pointer hover:w-10 ${hoveredHumBar?.sensor_id === it.sensor_id ? "w-10 ring-2 ring-white" : ""}`} 
                                      style={{ height: "4px" }}
                                    >
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex justify-center mt-8 space-x-8 text-sm">
                     <div className="flex items-center">
                      <div className="w-4 h-4 bg-gradient-to-r from-green-400 to-green-500 rounded-lg mr-3 shadow-sm"></div>
                      <span className={`font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Good</span>
                     </div>
                     <div className="flex items-center">
                      <div className="w-4 h-4 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-lg mr-3 shadow-sm"></div>
                      <span className={`font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Warning</span>
                     </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-gradient-to-r from-red-500 to-red-600 rounded-lg mr-3 shadow-sm"></div>
                      <span className={`font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Needs Attention</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-gradient-to-r from-slate-400 to-slate-500 rounded-lg mr-3 shadow-sm"></div>
                      <span className={`font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Offline</span>
                    </div>
                  </div>

                  {/* Humidity Table */}
                  <div className="mt-8">
                    <h4 className={`text-xl font-bold mb-6 ${darkMode ? "text-white" : "text-slate-900"}`}>Humidity Sensor Details</h4>
                    <div className={`overflow-x-auto rounded-xl border shadow-lg ${
                      darkMode ? "border-slate-700" : "border-slate-200"
                    }`}>
                      <table className={`w-full text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                        <thead className={darkMode ? "bg-slate-800" : "bg-slate-50"}>
                          <tr className={`border-b-2 ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200"}`}>
                            <th className={`text-left py-4 px-6 font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Sensor</th>
                            <th className={`text-left py-4 px-6 font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Reading</th>
                            <th className={`text-left py-4 px-6 font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Status</th>
                            <th className={`text-left py-4 px-6 font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Last Updated</th>
                            <th className={`text-left py-4 px-6 font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {humItems.map((it, i) => (
                            <tr key={i} className={`border-b hover:bg-slate-50 transition-colors duration-200 ${darkMode ? "border-slate-700 hover:bg-slate-800" : "border-slate-100"}`}>
                              <td className="py-4 px-6 font-semibold">
                                <span className={darkMode ? "text-slate-200" : "text-slate-800"}>{it.name}</span>
                                <span className={`ml-3 text-xs px-3 py-1 rounded-full align-middle font-medium ${
                                  it.access_role === 'owner'
                                    ? 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border border-green-300'
                                    : it.access_role === 'admin'
                                    ? 'bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 border border-yellow-300'
                                    : 'bg-gradient-to-r from-slate-100 to-slate-200 text-slate-800 border border-slate-300'
                                }`}>
                                  {it.access_role}
                                </span>
                              </td>
                              <td className="py-4 px-6">
                                 <span
                                  className={`text-lg font-bold ${
                                    it.status === "alert" ? "text-red-600" : it.status === "warning" ? "text-yellow-600" : it.status === "offline" || it.status === "unknown" ? "text-slate-500" : "text-green-600"
                                   }`}
                                 >
                                   {it.status === "offline" || it.status === "unknown" ? "NA" : (it.value != null ? `${it.value.toFixed(1)}%` : "--%")}
                                 </span>
                               </td>
                              <td className="py-4 px-6">
                                <span
                                  className={`px-3 py-2 rounded-full text-sm font-semibold shadow-sm ${
                                     it.status === "alert"
                                      ? "bg-gradient-to-r from-red-100 to-red-200 text-red-800 border border-red-300"
                                       : it.status === "warning"
                                      ? "bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 border border-yellow-300"
                                       : it.status === "offline" || it.status === "unknown"
                                      ? "bg-gradient-to-r from-slate-100 to-slate-200 text-slate-800 border border-slate-300"
                                      : "bg-gradient-to-r from-green-100 to-green-200 text-green-800 border border-green-300"
                                  }`}
                                 >
                                  {it.status}
                                </span>
                              </td>
                              <td className={`py-4 px-6 font-medium ${
                                darkMode ? "text-slate-300" : "text-slate-600"
                              }`}>{
                                 it.lastFetchedTime
                                   ? fmtDate(it.lastFetchedTime, prefs.tz, true)
                                   : "No data"
                               }</td>
                              <td className="py-4 px-6">
                                <div className="flex items-center gap-2">
                                  {(it.access_role === 'owner' || it.access_role === 'admin') && (
                                    <>
                                      <button
                                        onClick={() => router.push(`/teams?sensor=${it.sensor_id}`)}
                                        className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                          darkMode
                                            ? 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 border border-blue-800'
                                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                                        }`}
                                        title="Assign users to this sensor"
                                      >
                                        Assign
                                      </button>
                                      <button
                                        className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                          darkMode
                                            ? 'bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 border border-yellow-800'
                                            : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200'
                                        }`}
                                        title="Mute alerts for this sensor"
                                      >
                                        Mute
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => router.push(`/devices?sensor=${it.sensor_id}`)}
                                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                      darkMode
                                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                                    }`}
                                    title="View sensor details"
                                  >
                                    View
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <footer className={`text-center mt-8 text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
          © 2025 Safe Sense. All rights reserved.
        </footer>
      </main>
    </div>
  );
}
