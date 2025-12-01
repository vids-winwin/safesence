'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../../../components/Sidebar';
import { useDarkMode } from '../../DarkModeContext';
import apiClient from '../../lib/apiClient';
import { Bluetooth, X } from 'lucide-react';

export default function AddDevice() {
  const router = useRouter();
  const { darkMode } = useDarkMode();

  const [currentView, setCurrentView] = useState('connect');
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [deviceName, setDeviceName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Guard against server-side render: navigator doesn't exist on the server
  const hasBluetooth =
    typeof navigator !== 'undefined' && !!navigator.bluetooth;

  const connectToBluetoothDevice = async () => {
    try {
      if (connectedDevice && deviceId) return;

      // Check if Bluetooth is available (browser-only)
      if (!hasBluetooth) {
        setError(
          'Bluetooth is not available. Please use HTTPS or a compatible browser.'
        );
        return;
      }

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'SafeSense' }],
        optionalServices: ['battery_service'],
      });
      setConnectedDevice(device.name || 'SafeSense Device');
      setDeviceId(device.id);
      if (!deviceName) setDeviceName(device.name || '');
    } catch (e) {
      if (!String(e?.message || '').toLowerCase().includes('cancel')) {
        setError(
          'Bluetooth connection failed: ' + (e?.message || String(e))
        );
      }
    }
  };

  const disconnectDevice = () => {
    setConnectedDevice(null);
    setDeviceId(null);
  };

  const nextFromConnect = () => {
    if (!connectedDevice) return;
    setCurrentView('settings');
  };

  const save = async () => {
    if (!deviceId) {
      setError('Please connect to a device first.');
      return;
    }
    try {
      setSaving(true);
      await apiClient.createDevice({
        deviceId,
        deviceName: deviceName || connectedDevice || '',
      });
      setCurrentView('success');
    } catch (e) {
      setError(e?.message || 'Failed to create device');
    } finally {
      setSaving(false);
    }
  };

  const finish = () => {
    router.push('/devices');
  };

  const ConnectStep = () => (
    <div className="flex-1 flex items-center justify-center">
      <div
        className={`rounded-lg shadow-lg p-12 text-center max-w-md w-full ${
          darkMode ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-800'
        }`}
      >
        <div className="flex justify-center items-center space-x-4 mb-8">
          <div className="flex items-center space-x-2">
            <div
              className={`w-8 h-8 text-white rounded-full flex items-center justify-center text-sm font-medium ${
                darkMode ? 'bg-orange-700' : 'bg-orange-500'
              }`}
            >
              1
            </div>
            <span
              className={`${
                darkMode ? 'text-orange-400' : 'text-orange-500'
              } text-sm font-medium`}
            >
              Connect
            </span>
          </div>
          <div
            className={`${
              darkMode ? 'bg-orange-700' : 'bg-orange-500'
            } w-12 h-px`}
          />
          <div className="flex items-center space-x-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                darkMode
                  ? 'bg-gray-700 text-gray-400'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              2
            </div>
            <span
              className={`${
                darkMode ? 'text-gray-400' : 'text-gray-500'
              } text-sm font-medium`}
            >
              Settings
            </span>
          </div>
          <div className="w-12 h-px bg-gray-300" />
          <div className="flex items-center space-x-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                darkMode
                  ? 'bg-gray-700 text-gray-400'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              3
            </div>
            <span
              className={`${
                darkMode ? 'text-gray-400' : 'text-gray-500'
              } text-sm font-medium`}
            >
              Finish
            </span>
          </div>
        </div>

        <div className="mb-8">
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 cursor-pointer ${
              darkMode ? 'bg-blue-900' : 'bg-blue-100'
            } ${!hasBluetooth ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={
              hasBluetooth
                ? connectToBluetoothDevice
                : () =>
                    setError(
                      'Bluetooth is not available. Please use HTTPS or a compatible browser.'
                    )
            }
          >
            <Bluetooth
              className={`w-10 h-10 ${
                darkMode ? 'text-blue-400' : 'text-blue-500'
              }`}
            />
          </div>
          <h3 className="text-xl font-semibold mb-4">
            Automatic Device Detection
          </h3>
          <p
            className={`${
              darkMode ? 'text-gray-400' : 'text-gray-600'
            } mb-4`}
          >
            Pair with your SafeSense device
          </p>
          <p
            className={`${
              darkMode ? 'text-gray-500' : 'text-gray-500'
            } text-sm`}
          >
            Device:{' '}
            <span
              className={`${
                darkMode ? 'text-gray-400' : 'text-gray-400'
              }`}
            >
              {connectedDevice || 'Not connected'}
            </span>
          </p>
        </div>

        <div className="flex space-x-4">
          {connectedDevice && (
            <button
              onClick={disconnectDevice}
              className={`px-4 py-2 rounded-lg font-medium text-white ${
                darkMode
                  ? 'bg-red-700 hover:bg-red-800'
                  : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              <X className="w-4 h-4 inline mr-1" /> Disconnect
            </button>
          )}
          <button
            onClick={() => router.push('/devices')}
            className={`flex-1 px-6 py-3 rounded-lg font-medium border ${
              darkMode
                ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={nextFromConnect}
            className={`flex-1 px-6 py-3 rounded-lg font-medium text-white border ${
              darkMode
                ? 'bg-orange-700 hover:bg-orange-800 border-orange-700'
                : 'bg-orange-500 hover:bg-orange-600 border-orange-500'
            }`}
            disabled={!connectedDevice}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );

  const SettingsStep = () => (
    <div className="flex-1 flex items-center justify-center">
      <div
        className={`rounded-lg shadow-lg p-12 max-w-md w-full ${
          darkMode ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-800'
        }`}
      >
        <div className="flex justify-center items-center space-x-4 mb-8">
          <div className="flex items-center space-x-2">
            <div
              className={`w-8 h-8 text-white rounded-full flex items-center justify-center text-sm font-medium ${
                darkMode ? 'bg-orange-700' : 'bg-orange-500'
              }`}
            >
              ✓
            </div>
            <span
              className={`${
                darkMode ? 'text-orange-400' : 'text-orange-500'
              } text-sm font-medium`}
            >
              Connect
            </span>
          </div>
          <div
            className={`${
              darkMode ? 'bg-orange-700' : 'bg-orange-500'
            } w-12 h-px`}
          />
          <div className="flex items-center space-x-2">
            <div
              className={`w-8 h-8 text-white rounded-full flex items-center justify-center text-sm font-medium ${
                darkMode ? 'bg-orange-700' : 'bg-orange-500'
              }`}
            >
              2
            </div>
            <span
              className={`${
                darkMode ? 'text-orange-400' : 'text-orange-500'
              } text-sm font-medium`}
            >
              Settings
            </span>
          </div>
          <div className="w-12 h-px bg-gray-300" />
          <div className="flex items-center space-x-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                darkMode
                  ? 'bg-gray-700 text-gray-400'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              3
            </div>
            <span
              className={`${
                darkMode ? 'text-gray-400' : 'text-gray-500'
              } text-sm font-medium`}
            >
              Finish
            </span>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-semibold mb-2">Device Name</h3>
            <p
              className={`${
                darkMode ? 'text-gray-400' : 'text-gray-600'
              } mb-6`}
            >
              Give this device a name
            </p>
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className={`w-full p-3 border rounded-lg outline-none ${
                  darkMode
                    ? 'bg-gray-700 text-gray-300 border-gray-600 focus:ring-2 focus:ring-orange-700 focus:border-orange-700'
                    : 'bg-white text-gray-900 border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500'
                }`}
                placeholder="Enter device name"
              />
            </div>
          </div>

          <div className="flex space-x-4 pt-4">
            <button
              onClick={() => setCurrentView('connect')}
              className={`flex-1 px-6 py-3 rounded-lg font-medium border ${
                darkMode
                  ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Back
            </button>
            <button
              onClick={save}
              disabled={!deviceName}
              className={`flex-1 px-6 py-3 rounded-lg font-medium text-white border ${
                !deviceName
                  ? 'bg-gray-300 cursor-not-allowed border-gray-300'
                  : darkMode
                  ? 'bg-orange-700 hover:bg-orange-800 border-orange-700'
                  : 'bg-orange-500 hover:bg-orange-600 border-orange-500'
              }`}
            >
              {saving ? 'Saving…' : 'Finish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const SuccessStep = () => (
    <div className="relative h-full">
      <div className="flex-1 flex items-center justify-center">
        <div
          className={`rounded-lg shadow-lg p-12 text-center max-w-md w-full ${
            darkMode ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-800'
          }`}
        >
          <div className="flex justify-center items-center space-x-4 mb-8">
            <div className="flex items-center space-x-2">
              <div
                className={`w-8 h-8 text-white rounded-full flex items-center justify-center text-sm ${
                  darkMode ? 'bg-orange-700' : 'bg-orange-500'
                }`}
              >
                ✓
              </div>
              <span
                className={`${
                  darkMode ? 'text-orange-400' : 'text-orange-500'
                } text-sm font-medium`}
              >
                Connect
              </span>
            </div>
            <div
              className={`${
                darkMode ? 'bg-orange-700' : 'bg-orange-500'
              } w-12 h-px`}
            />
            <div className="flex items-center space-x-2">
              <div
                className={`w-8 h-8 text-white rounded-full flex items-center justify-center text-sm ${
                  darkMode ? 'bg-orange-700' : 'bg-orange-500'
                }`}
              >
                ✓
              </div>
              <span
                className={`${
                  darkMode ? 'text-orange-400' : 'text-orange-500'
                } text-sm font-medium`}
              >
                Settings
              </span>
            </div>
            <div
              className={`${
                darkMode ? 'bg-orange-700' : 'bg-orange-500'
              } w-12 h-px`}
            />
            <div className="flex items-center space-x-2">
              <div
                className={`w-8 h-8 text-white rounded-full flex items-center justify-center text-sm font-medium ${
                  darkMode ? 'bg-orange-700' : 'bg-orange-500'
                }`}
              >
                3
              </div>
              <span
                className={`${
                  darkMode ? 'text-orange-400' : 'text-orange-500'
                } text-sm font-medium`}
              >
                Finish
              </span>
            </div>
          </div>

          <div className="mb-8">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
                darkMode ? 'bg-green-900' : 'bg-green-100'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  darkMode ? 'bg-green-700' : 'bg-green-500'
                }`}
              >
                <span className="text-white text-sm">✓</span>
              </div>
            </div>
            <p
              className={`${
                darkMode ? 'text-gray-400' : 'text-gray-600'
              } mb-1`}
            >
              This device is added
            </p>
            <p
              className={`${
                darkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              successfully to your Dashboard
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={finish}
              className={`w-48 px-4 py-3 rounded-lg font-medium text-white border mx-auto block ${
                darkMode
                  ? 'bg-orange-700 hover:bg-orange-800 border-orange-700'
                  : 'bg-orange-500 hover:bg-orange-600 border-orange-500'
              }`}
            >
              Done
            </button>
            <button
              onClick={finish}
              className={`w-48 px-4 py-3 rounded-lg font-medium border mx-auto block ${
                darkMode
                  ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Later
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 right-8">
        <button
          onClick={finish}
          className={`px-8 py-3 rounded-lg font-medium text-white border ${
            darkMode
              ? 'bg-orange-700 hover:bg-orange-800 border-orange-700'
              : 'bg-orange-500 hover:bg-orange-600 border-orange-500'
          }`}
        >
          Done
        </button>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (currentView) {
      case 'connect':
        return <ConnectStep />;
      case 'settings':
        return <SettingsStep />;
      case 'success':
        return <SuccessStep />;
      default:
        return <ConnectStep />;
    }
  };

  return (
    <div
      className={`flex min-h-screen ${
        darkMode
          ? 'bg-slate-900 text-white'
          : 'bg-gradient-to-br from-slate-50 to-blue-50 text-slate-800'
      }`}
    >
      <Sidebar activeKey="devices" darkMode={darkMode} />
      <main className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold">Add Device</h2>
          <button
            onClick={() => router.push('/devices')}
            className={`${
              darkMode
                ? 'text-gray-300 hover:text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <div className="mb-4 text-sm text-red-500">{error}</div>}
        {renderContent()}
        <footer
          className={`text-center mt-8 text-sm ${
            darkMode ? 'text-gray-300' : 'text-gray-600'
          }`}
        >
          © 2025 Safe Sense. All rights reserved.
        </footer>
      </main>
    </div>
  );
}
