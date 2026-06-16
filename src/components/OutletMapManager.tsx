import React, { useState, useEffect, useRef } from 'react';
import { MapPin, LocateFixed, Save, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';

// Read API Key from environment config
const GOOGLE_MAPS_API_KEY =
  (process.env as any).GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

const hasValidMapsKey = Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== 'YOUR_API_KEY';

interface Outlet {
  nama: string;
  lat: number;
  lng: number;
  radius: number;
}

interface OutletMapManagerProps {
  outlets: Outlet[];
  onSaveOutlets: (updatedOutlets: Outlet[]) => Promise<void>;
  saving: boolean;
}

// Custom google.maps.Circle wrapper for react-google-maps
function MapCircle({ center, radius, options }: { center: google.maps.LatLngLiteral; radius: number; options?: google.maps.CircleOptions }) {
  const map = useMap();
  const circleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!map) return;

    const circle = new google.maps.Circle({
      map,
      center,
      radius,
      fillColor: '#cc0000',
      fillOpacity: 0.15,
      strokeColor: '#cc0000',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      ...options,
    });

    circleRef.current = circle;

    return () => {
      circle.setMap(null);
    };
  }, [map]);

  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setCenter(center);
    }
  }, [center]);

  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radius);
    }
  }, [radius]);

  return null;
}

// Controller to handle center updates when outlet selection changes
function MapInitializer({ center }: { center: google.maps.LatLngLiteral }) {
  const map = useMap();
  useEffect(() => {
    if (map) {
      map.panTo(center);
    }
  }, [map, center]);
  return null;
}

export default function OutletMapManager({ outlets: initialOutlets, onSaveOutlets, saving }: OutletMapManagerProps) {
  // Always work with local copy so changes won't immediately commit to global state until Saved
  const [localOutlets, setLocalOutlets] = useState<Outlet[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Synchronize with initialOutlets
  useEffect(() => {
    if (initialOutlets && initialOutlets.length > 0) {
      setLocalOutlets(JSON.parse(JSON.stringify(initialOutlets)));
    } else {
      // Fallback defaults
      setLocalOutlets([
        { nama: "YZ_ MDP PASIR JAHA BALARAJA", lat: -6.205649180689262, lng: 106.45134398119775, radius: 150 },
        { nama: "YZ_ MDP JAYANTI CIKANDE", lat: -6.206571510648256, lng: 106.38621792361727, radius: 150 }
      ]);
    }
  }, [initialOutlets]);

  const currentOutlet = localOutlets[selectedIndex] || { nama: '', lat: 0, lng: 0, radius: 150 };

  const handleCoordinateChange = (lat: number, lng: number) => {
    setLocalOutlets(prev => {
      const copy = [...prev];
      if (copy[selectedIndex]) {
        copy[selectedIndex] = {
          ...copy[selectedIndex],
          lat: parseFloat(lat.toFixed(15)),
          lng: parseFloat(lng.toFixed(15))
        };
      }
      return copy;
    });
  };

  const handleRadiusChange = (radiusStr: string) => {
    const val = parseInt(radiusStr) || 150;
    setLocalOutlets(prev => {
      const copy = [...prev];
      if (copy[selectedIndex]) {
        copy[selectedIndex] = { ...copy[selectedIndex], radius: val };
      }
      return copy;
    });
  };

  const handleManualInput = (field: 'lat' | 'lng', valStr: string) => {
    const floatVal = parseFloat(valStr);
    if (isNaN(floatVal)) return;
    setLocalOutlets(prev => {
      const copy = [...prev];
      if (copy[selectedIndex]) {
        copy[selectedIndex] = { ...copy[selectedIndex], [field]: floatVal };
      }
      return copy;
    });
  };

  // Get current device location
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      return toast.error("Browser tidak mendukung GPS Geolocation.");
    }

    const toastId = toast.loading("Mendapatkan GPS koordinat Anda...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        handleCoordinateChange(latitude, longitude);
        toast.success(`Berhasil mendapatkan koordinat lokasi Anda!`, { id: toastId });
      },
      (error) => {
        toast.error(`Gagal mendapatkan GPS: ${error.message}`, { id: toastId });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = async () => {
    try {
      await onSaveOutlets(localOutlets);
    } catch (err: any) {
      toast.error(`Koneksi error: ${err.message}`);
    }
  };

  const mapCenter = { lat: currentOutlet.lat, lng: currentOutlet.lng };

  return (
    <div className="w-full bg-white border border-neutral-200 rounded-xl shadow-sm p-5 flex flex-col gap-6 mt-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
        <div>
          <h3 className="font-bold text-neutral-800 text-base flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#cc0000]" />
            Atur Koordinat Titik Lokasi Outlet
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Ubah koordinat GPS outlet agar keakuratan deteksi absen presisi. Tarik marker di peta atau ketik nilai koordinat.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || localOutlets.length === 0}
          className="bg-[#cc0000] hover:bg-[#a30000] text-white font-bold text-sm px-4 py-2.5 rounded-lg shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-55 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Menyimpan...' : 'Simpan Semua Koordinat'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Editor and selection */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold text-neutral-600 uppercase mb-2">Pilih Outlet Yang Diatur</label>
            <div className="flex flex-col gap-2">
              {localOutlets.map((out, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedIndex(idx)}
                  className={`p-3 rounded-lg border text-left flex items-center justify-between transition ${
                    idx === selectedIndex
                      ? 'border-[#cc0000] bg-red-50 text-[#cc0000] font-bold shadow-sm'
                      : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2 max-w-[85%]">
                    <MapPin className={`w-4 h-4 shrink-0 ${idx === selectedIndex ? 'text-[#cc0000]' : 'text-neutral-400'}`} />
                    <span className="text-xs truncate">{out.nama}</span>
                  </div>
                  <span className="font-mono text-[10px] bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-600">
                    r: {out.radius}m
                  </span>
                </button>
              ))}
            </div>
          </div>

          {localOutlets.length > 0 && (
            <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 flex flex-col gap-3.5">
              <div className="border-b border-neutral-200/60 pb-2">
                <span className="font-bold text-xs text-neutral-800">Detail Koordinat:</span>
                <p className="text-[11px] text-neutral-500 font-medium truncate mt-0.5">{currentOutlet.nama}</p>
              </div>

              {/* Latitude */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={currentOutlet.lat}
                  onChange={(e) => handleManualInput('lat', e.target.value)}
                  className="w-full p-2 text-xs bg-white border border-neutral-300 rounded focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none font-mono"
                />
              </div>

              {/* Longitude */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={currentOutlet.lng}
                  onChange={(e) => handleManualInput('lng', e.target.value)}
                  className="w-full p-2 text-xs bg-white border border-neutral-300 rounded focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none font-mono"
                />
              </div>

              {/* Radius Geofence */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Radius Pemantauan Absen (meter)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="50"
                    max="1000"
                    step="10"
                    value={currentOutlet.radius}
                    onChange={(e) => handleRadiusChange(e.target.value)}
                    className="w-full accent-[#cc0000]"
                  />
                  <input
                    type="number"
                    value={currentOutlet.radius}
                    onChange={(e) => handleRadiusChange(e.target.value)}
                    className="w-20 p-1.5 text-xs text-center border border-neutral-300 rounded bg-white font-bold"
                  />
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">
                  Direkomendasikan 150 - 300 meter untuk menghindari deviasi GPS handphone pegawai.
                </p>
              </div>

              <button
                type="button"
                onClick={useCurrentLocation}
                className="w-full flex items-center justify-center gap-2 py-2 bg-neutral-200 hover:bg-neutral-300 active:bg-neutral-400 text-neutral-850 text-xs font-bold rounded-lg transition"
              >
                <LocateFixed className="w-3.5 h-3.5 text-neutral-700" />
                Gunakan GPS Posisi Saya Sekarang
              </button>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Interactive Map Component */}
        <div className="lg:col-span-7 flex flex-col gap-2">
          {!hasValidMapsKey ? (
            <div className="w-full h-[380px] md:h-[450px] bg-neutral-100 rounded-xl border border-neutral-200/80 p-6 flex flex-col items-center justify-center text-center">
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-850 p-4 rounded-xl max-w-lg shadow-sm">
                <div className="flex justify-center mb-1">
                  <AlertCircle className="w-8 h-8 text-yellow-600" />
                </div>
                <h4 className="font-bold text-sm text-yellow-900 mb-2">Google Maps Key Belum Terpasang</h4>
                <p className="text-xs text-yellow-800 leading-relaxed mb-4">
                  Anda tetap bisa merubah titik menggunakan input angka koordinat di samping. Untuk mengaktifkan peta interaktif (tarik & klik pin), silakan pasang API Key di AI Studio.
                </p>
                
                <div className="text-left bg-white/70 p-3 rounded border border-yellow-300 inline-block w-full text-xs">
                  <p className="font-bold mb-1">Cara menambahkan API Key:</p>
                  <ol className="list-decimal pl-4 space-y-1 font-medium text-neutral-700">
                    <li>Dapatkan API Key dari Console GCP Google Maps.</li>
                    <li>Klik tombol <strong>Settings</strong> (ikon ⚙️ gerigi di pojok kanan atas layar Anda).</li>
                    <li>Pilih menu <strong>Secrets</strong>.</li>
                    <li>Masukkan nama rahasia: <code className="bg-neutral-105 font-mono text-[10.5px] px-1 py-0.5 rounded font-bold border border-neutral-200">GOOGLE_MAPS_PLATFORM_KEY</code></li>
                    <li>Tempel kunci API Anda dan tekan tombol simpan / Enter.</li>
                  </ol>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full border border-neutral-200 rounded-xl overflow-hidden shadow-inner relative bg-neutral-100">
              <div className="absolute top-2.5 left-2.5 z-10 bg-white/95 px-2.5 py-1.5 rounded-md text-[11px] font-bold shadow-sm text-neutral-800 border border-neutral-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Peta Interaktif: Pilih lokasi dengan mengklik peta atau menyeret marker merah.
              </div>
              <div className="w-full h-[380px] md:h-[450px]">
                <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
                  <Map
                    defaultCenter={mapCenter}
                    defaultZoom={15}
                    mapId="OUTLET_LOCATOR_MAP_ID"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    style={{ width: '100%', height: '100%' }}
                    onClick={(e) => {
                      if (e.detail?.latLng) {
                        handleCoordinateChange(e.detail.latLng.lat, e.detail.latLng.lng);
                      }
                    }}
                  >
                    <MapInitializer center={mapCenter} />
                    
                    <AdvancedMarker
                      position={mapCenter}
                      draggable={true}
                      onDragEnd={(e) => {
                        if (e.latLng) {
                          handleCoordinateChange(e.latLng.lat(), e.latLng.lng());
                        }
                      }}
                      title={currentOutlet.nama}
                    >
                      <Pin background="#cc0000" glyphColor="#ffffff" borderColor="#8a0000" />
                    </AdvancedMarker>

                    <MapCircle
                      center={mapCenter}
                      radius={currentOutlet.radius}
                    />
                  </Map>
                </APIProvider>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
