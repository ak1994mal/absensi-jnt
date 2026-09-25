import React, { Component, useState, useEffect, useMemo } from 'react';
import { MapPin, LocateFixed, Save, Layers, Map as MapIcon, Info, Plus, Trash2, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from 'react-leaflet';

export interface Outlet {
  nama: string;
  lat: number;
  lng: number;
  radius: number;
}

interface OutletMapManagerProps {
  outlets: Outlet[];
  onSaveOutlets: (updatedOutlets: Outlet[]) => Promise<void>;
  saving: boolean;
  onRefresh?: () => void;
}

// React Error Boundary to catch map-specific crashes (e.g. Leaflet element rendering errors)
class MapErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  public state: { hasError: boolean } = { hasError: false };

  public static getDerivedStateFromError() {
    return { hasError: true };
  }
  
  public componentDidCatch(error: any, errorInfo: any) {
    console.error("Map rendering crash caught:", error, errorInfo);
  }

  public render() {
    if ((this.state as any).hasError) {
      return (
        <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-xl text-center flex flex-col items-center gap-3">
          <MapIcon className="w-8 h-8 text-red-500 animate-pulse" />
          <h4 className="text-sm font-bold">Peta Interaktif Gagal Dimuat</h4>
          <p className="text-xs text-neutral-500 max-w-md">
            Browser mengalami kendala saat inisialisasi peta. Anda tetap dapat mengubah nama dan titik koordinat outlet secara presisi menggunakan kolom input angka di bawah ini.
          </p>
          <button 
            type="button"
            onClick={() => (this as any).setState({ hasError: false })}
            className="px-4 py-2 bg-[#cc0000] hover:bg-[#a30000] text-white text-xs font-bold rounded-lg shadow transition"
          >
            Muat Ulang Peta
          </button>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

// Component to handle dynamic map center
function MapCenterUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (typeof center[0] === 'number' && typeof center[1] === 'number' && !isNaN(center[0]) && !isNaN(center[1]) && center[0] !== 0 && center[1] !== 0) {
      map.setView(center, map.getZoom() || 15);
    }
  }, [center[0], center[1], map]);
  return null;
}

export default function OutletMapManager({ outlets: initialOutlets, onSaveOutlets, saving, onRefresh }: OutletMapManagerProps) {
  const [localOutlets, setLocalOutlets] = useState<Outlet[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [activeMapOutletIdx, setActiveMapOutletIdx] = useState<number>(0);

  // Synchronize with initialOutlets (No hardcoded outlets fallback)
  useEffect(() => {
    if (initialOutlets && Array.isArray(initialOutlets) && initialOutlets.length > 0) {
      try {
        const cleaned = initialOutlets.map((o: any) => ({
          nama: String(o.nama || o.name || "").trim(),
          lat: typeof o.lat === 'number' ? o.lat : (parseFloat(String(o.lat)) || 0),
          lng: typeof o.lng === 'number' ? o.lng : (parseFloat(String(o.lng)) || 0),
          radius: typeof o.radius === 'number' ? o.radius : (parseInt(String(o.radius), 10) || 150)
        }));
        setLocalOutlets(cleaned);
      } catch (e) {
        console.warn("Gagal parse initialOutlets:", e);
      }
    } else {
      // Empty state from sheet: do NOT insert hardcoded outlets
      setLocalOutlets([]);
    }
  }, [initialOutlets]);

  const handleNameChange = (index: number, name: string) => {
    setLocalOutlets(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], nama: name };
      }
      return copy;
    });
  };

  const handleCoordinateChange = (index: number, field: 'lat' | 'lng', value: number) => {
    setLocalOutlets(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = {
          ...copy[index],
          [field]: value
        };
      }
      return copy;
    });
  };

  const handleRadiusChange = (index: number, radiusStr: string) => {
    const val = parseInt(radiusStr) || 150;
    setLocalOutlets(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], radius: val };
      }
      return copy;
    });
  };

  const handleAddOutlet = () => {
    const newIndex = localOutlets.length;
    // Default location near Balaraja/Tangerang or 0 if unknown
    const defaultLat = localOutlets.length > 0 && localOutlets[0].lat !== 0 ? localOutlets[0].lat : -6.205649;
    const defaultLng = localOutlets.length > 0 && localOutlets[0].lng !== 0 ? localOutlets[0].lng : 106.451344;
    
    const newOutlet: Outlet = {
      nama: "",
      lat: parseFloat(defaultLat.toFixed(6)),
      lng: parseFloat(defaultLng.toFixed(6)),
      radius: 150
    };

    setLocalOutlets(prev => [...prev, newOutlet]);
    setActiveMapOutletIdx(newIndex);
    toast.info("Baris outlet baru berhasil ditambahkan. Silakan lengkapi Nama Outlet dan koordinat, lalu klik Simpan.");
  };

  const handleDeleteOutlet = (index: number) => {
    const out = localOutlets[index];
    const nameLabel = out?.nama ? `"${out.nama}"` : `Outlet #${index + 1}`;
    
    if (window.confirm(`Apakah Anda yakin ingin menghapus ${nameLabel} dari daftar? Klik Simpan setelah ini untuk memperbarui ke Google Spreadsheet.`)) {
      setLocalOutlets(prev => {
        const next = prev.filter((_, i) => i !== index);
        return next;
      });
      if (activeMapOutletIdx >= localOutlets.length - 1) {
        setActiveMapOutletIdx(Math.max(0, localOutlets.length - 2));
      }
      toast.success(`${nameLabel} dihapus dari daftar lokal. Silakan klik 'Simpan Semua Outlet' untuk menerapkan ke spreadsheet.`);
    }
  };

  // Get current device location for a specific outlet
  const useCurrentLocation = (index: number, outletName: string) => {
    if (!navigator.geolocation) {
      return toast.error("Browser tidak mendukung GPS Geolocation.");
    }

    const toastId = toast.loading(`Mendapatkan koordinat GPS untuk ${outletName || 'outlet baru'}...`);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocalOutlets(prev => {
          const copy = [...prev];
          if (copy[index]) {
            copy[index] = {
              ...copy[index],
              lat: parseFloat(latitude.toFixed(6)),
              lng: parseFloat(longitude.toFixed(6))
            };
          }
          return copy;
        });
        setActiveMapOutletIdx(index);
        toast.success(`Berhasil mendapatkan koordinat GPS terkini!`, { id: toastId });
      },
      (error) => {
        toast.error(`Gagal mendapatkan GPS: ${error.message}`, { id: toastId });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const validateAllOutlets = (outletsToValidate: Outlet[]): boolean => {
    if (outletsToValidate.length === 0) {
      toast.error("Daftar outlet kosong. Tambahkan minimal satu outlet sebelum menyimpan.");
      return false;
    }

    const trimmedNames: string[] = [];

    for (let i = 0; i < outletsToValidate.length; i++) {
      const out = outletsToValidate[i];
      const name = (out.nama || "").trim();
      
      if (!name) {
        toast.error(`Nama Outlet baris ke-${i + 1} wajib diisi!`);
        return false;
      }

      if (typeof out.lat !== 'number' || isNaN(out.lat) || out.lat < -90 || out.lat > 90 || out.lat === 0) {
        toast.error(`Latitude untuk outlet "${name}" tidak valid (harus angka antara -90 dan 90).`);
        return false;
      }

      if (typeof out.lng !== 'number' || isNaN(out.lng) || out.lng < -180 || out.lng > 180 || out.lng === 0) {
        toast.error(`Longitude untuk outlet "${name}" tidak valid (harus angka antara -180 dan 180).`);
        return false;
      }

      if (typeof out.radius !== 'number' || isNaN(out.radius) || out.radius <= 0) {
        toast.error(`Radius untuk outlet "${name}" harus berupa angka lebih besar dari 0 meter.`);
        return false;
      }

      const lower = name.toLowerCase();
      if (trimmedNames.includes(lower)) {
        toast.error(`Nama Outlet "${name}" duplikat! Setiap nama outlet harus unik.`);
        return false;
      }
      trimmedNames.push(lower);
    }

    return true;
  };

  const saveAllOutlets = async () => {
    if (!validateAllOutlets(localOutlets)) return;
    try {
      await onSaveOutlets(localOutlets);
      toast.success("Semua data outlet berhasil disimpan ke Google Spreadsheet (sheet DataOutlet)!");
    } catch (err: any) {
      toast.error(`Gagal menyimpan outlet: ${err?.message || err}`);
    }
  };

  const saveSpecificOutlet = async (idxToSave: number, outletName: string) => {
    if (!validateAllOutlets(localOutlets)) return;
    try {
      setSavingIdx(idxToSave);
      await onSaveOutlets(localOutlets);
      toast.success(`Berhasil menyimpan data outlet ${outletName || 'baru'} ke Google Spreadsheet!`);
    } catch (err: any) {
      toast.error(`Gagal menyimpan: ${err.message}`);
    } finally {
      setSavingIdx(null);
    }
  };

  // Center coordinates for map view
  const activeOutlet = localOutlets[activeMapOutletIdx] || localOutlets[0];
  const centerLat = (activeOutlet && typeof activeOutlet.lat === 'number' && !isNaN(activeOutlet.lat) && activeOutlet.lat !== 0) 
    ? activeOutlet.lat 
    : -6.205649;
  const centerLng = (activeOutlet && typeof activeOutlet.lng === 'number' && !isNaN(activeOutlet.lng) && activeOutlet.lng !== 0) 
    ? activeOutlet.lng 
    : 106.451344;

  return (
    <div className="w-full bg-white border border-neutral-200 rounded-xl shadow-sm p-5 md:p-6 flex flex-col gap-6">
      {/* Header section with Action Title & Top Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
        <div>
          <h3 className="font-bold text-neutral-800 text-base flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#cc0000]" />
            Kelola Master Outlet &amp; Titik Lokasi GPS
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Sumber data tersimpan di Google Spreadsheet sheet <strong>DataOutlet</strong>. Seluruh pilihan outlet dan geofencing aplikasi otomatis mengikuti data ini.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
              title="Sinkronkan ulang dari spreadsheet"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Muat Ulang
            </button>
          )}

          <button
            type="button"
            onClick={handleAddOutlet}
            className="px-3.5 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            + Tambah Outlet
          </button>

          {localOutlets.length > 0 && (
            <button
              type="button"
              onClick={saveAllOutlets}
              disabled={saving}
              className="px-4 py-2 bg-[#cc0000] hover:bg-[#a30000] text-white text-xs font-bold rounded-lg shadow transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan Semua'}
            </button>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-2.5 bg-blue-50/70 p-3.5 rounded-lg border border-blue-150 text-xs text-blue-900">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p>
          Anda dapat mengubah <strong>Nama Outlet</strong>, mengetik koordinat <strong>Latitude/Longitude</strong> secara presisi, mengambil koordinat dengan <strong>GPS Saya</strong>, atau menggeser pin nomor pada peta interaktif di bawah.
        </p>
      </div>

      {/* Interactive Map */}
      <div className="h-[380px] w-full rounded-xl overflow-hidden border border-neutral-200 shadow-sm relative z-0">
        <MapErrorBoundary>
          <MapContainer center={[centerLat, centerLng]} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <MapCenterUpdater center={[centerLat, centerLng]} />
            
            {localOutlets.map((out, idx) => {
              const outLat = typeof out.lat === 'number' ? out.lat : parseFloat(String(out.lat)) || 0;
              const outLng = typeof out.lng === 'number' ? out.lng : parseFloat(String(out.lng)) || 0;
              
              if (outLat === 0 && outLng === 0) return null;

              const isCurrentActive = activeMapOutletIdx === idx;
              
              // Leaflet custom icon
              const iconHtml = `<div style="background-color: ${isCurrentActive ? '#cc0000' : '#4b5563'}; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; border: 2px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.3); margin-top: -14px; margin-left: -14px;">${idx + 1}</div>`;
              const icon = L.divIcon({
                className: 'custom-icon',
                html: iconHtml,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
              });

              return (
                <React.Fragment key={idx}>
                  <Marker 
                    position={[outLat, outLng]} 
                    draggable={true}
                    icon={icon}
                    eventHandlers={{
                      dragend: (e) => {
                        const marker = e.target;
                        if (marker != null) {
                          const pos = marker.getLatLng();
                          handleCoordinateChange(idx, 'lat', parseFloat(pos.lat.toFixed(6)));
                          handleCoordinateChange(idx, 'lng', parseFloat(pos.lng.toFixed(6)));
                          setActiveMapOutletIdx(idx);
                        }
                      },
                      click: () => {
                         setActiveMapOutletIdx(idx);
                      }
                    }}
                  >
                    <Popup>
                      <div className="font-bold text-sm text-neutral-800">{out.nama || `Outlet #${idx + 1}`}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">Radius: {out.radius} meter</div>
                      <div className="text-[10px] bg-red-50 text-red-700 px-2 py-1 mt-2 rounded font-medium border border-red-100">
                        Geser pin ini untuk memperbarui koordinat
                      </div>
                    </Popup>
                  </Marker>
                  <Circle 
                    center={[outLat, outLng]} 
                    radius={out.radius} 
                    pathOptions={{ 
                      color: isCurrentActive ? '#cc0000' : '#888888', 
                      fillColor: isCurrentActive ? '#cc0000' : '#888888', 
                      fillOpacity: isCurrentActive ? 0.15 : 0.08,
                      weight: isCurrentActive ? 2 : 1
                    }}
                  />
                </React.Fragment>
              );
            })}
          </MapContainer>
        </MapErrorBoundary>
      </div>

      {/* Empty State Banner if no outlets */}
      {localOutlets.length === 0 && (
        <div className="bg-neutral-50 border border-dashed border-neutral-300 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-3">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <h4 className="text-sm font-bold text-neutral-700">Belum Ada Outlet Terdaftar</h4>
          <p className="text-xs text-neutral-500 max-w-md">
            Data outlet di sheet <strong>DataOutlet</strong> masih kosong atau belum terisi. Klik tombol di bawah ini untuk menambahkan outlet baru ke sistem.
          </p>
          <button
            type="button"
            onClick={handleAddOutlet}
            className="mt-2 px-4 py-2 bg-[#cc0000] hover:bg-[#a30000] text-white text-xs font-bold rounded-lg shadow transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Tambah Outlet Pertama
          </button>
        </div>
      )}

      {/* Grid of Responsive Outlet Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {localOutlets.map((out, idx) => {
          const isActive = activeMapOutletIdx === idx;
          const outLat = typeof out.lat === 'number' ? out.lat : parseFloat(String(out.lat)) || 0;
          const outLng = typeof out.lng === 'number' ? out.lng : parseFloat(String(out.lng)) || 0;

          return (
            <div 
              key={idx}
              onClick={() => setActiveMapOutletIdx(idx)}
              className={`bg-neutral-50 hover:bg-neutral-50/80 border ${isActive ? 'border-[#cc0000] ring-2 ring-[#cc0000]/20 bg-white' : 'border-neutral-200'} rounded-xl p-5 shadow-sm transition flex flex-col gap-4 relative cursor-pointer`}
            >
              {/* Outlet Header: Number + Name Input + Delete Button */}
              <div className="flex items-start gap-2.5 border-b border-neutral-200/60 pb-3" onClick={e => e.stopPropagation()}>
                <div className={`p-2 rounded-lg shrink-0 flex items-center justify-center font-bold text-sm w-9 h-9 ${isActive ? 'bg-[#cc0000] text-white shadow-md' : 'bg-neutral-200 text-neutral-700'}`}>
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">
                    Nama Outlet <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={out.nama}
                    placeholder="Contoh: MDP Pasir Jaha Balaraja"
                    onChange={e => handleNameChange(idx, e.target.value)}
                    className="w-full text-xs font-bold text-neutral-800 bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#cc0000] focus:border-[#cc0000] transition"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteOutlet(idx)}
                  className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0"
                  title="Hapus outlet ini"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Editable Coordinates Fields */}
              <div className="grid grid-cols-2 gap-2.5" onClick={e => e.stopPropagation()}>
                <div>
                  <label className="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                    Latitude <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="number" 
                    step="any"
                    value={out.lat === 0 ? '' : out.lat} 
                    placeholder="-6.xxxx"
                    onChange={e => handleCoordinateChange(idx, 'lat', parseFloat(e.target.value) || 0)}
                    className="w-full text-xs font-mono bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                    Longitude <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="number" 
                    step="any"
                    value={out.lng === 0 ? '' : out.lng} 
                    placeholder="106.xxxx"
                    onChange={e => handleCoordinateChange(idx, 'lng', parseFloat(e.target.value) || 0)}
                    className="w-full text-xs font-mono bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500 font-medium"
                  />
                </div>
              </div>

              {/* Slider Radius */}
              <div onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wide">Batas Toleransi Radius Absen</label>
                  <span className="text-xs font-bold text-[#cc0000] font-mono bg-red-50 border border-red-200 px-2 py-0.5 rounded shadow-sm">
                    {out.radius} meter
                  </span>
                </div>
                
                <div className="flex items-center gap-3 bg-white p-2.5 border border-neutral-200 rounded-lg shadow-sm">
                  <input
                    type="range"
                    min="10"
                    max="1000"
                    step="5"
                    value={out.radius}
                    onChange={(e) => handleRadiusChange(idx, e.target.value)}
                    className="w-full accent-[#cc0000] cursor-pointer"
                  />
                  <div className="flex items-center gap-1 shrink-0 bg-neutral-100 border border-neutral-200 px-2 py-1 rounded font-bold text-xs font-mono">
                    <input
                      type="number"
                      min="1"
                      value={out.radius}
                      onChange={(e) => handleRadiusChange(idx, e.target.value)}
                      className="w-12 bg-transparent text-center border-none focus:outline-none p-0 focus:ring-0 text-xs font-bold"
                    />
                    <span className="text-neutral-400 text-[10px]">m</span>
                  </div>
                </div>
              </div>

              {/* Individual Action Buttons */}
              <div className="grid grid-cols-1 gap-2 pt-2 border-t border-neutral-200/50 mt-1" onClick={e => e.stopPropagation()}>
                <div className="flex gap-2">
                   <button
                     type="button"
                     onClick={() => useCurrentLocation(idx, out.nama)}
                     className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-neutral-200/80 hover:bg-neutral-300 text-neutral-800 text-[11px] font-bold rounded-lg transition text-center cursor-pointer shadow-sm select-none"
                     title="Ambil koordinat GPS lokasi perangkat Anda saat ini"
                   >
                     <LocateFixed className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                     Sesuai GPS Saya
                   </button>
                   <button
                     type="button"
                     onClick={() => saveSpecificOutlet(idx, out.nama)}
                     disabled={saving}
                     className="flex-1 bg-[#cc0000] hover:bg-[#a30000] text-white font-bold text-[11px] py-2 rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer uppercase tracking-wider select-none text-center"
                   >
                     <Save className="w-3.5 h-3.5 shrink-0" />
                     {saving && savingIdx === idx ? 'Menyimpan...' : 'Simpan'}
                   </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
