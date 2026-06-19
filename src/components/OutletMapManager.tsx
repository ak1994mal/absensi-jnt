import React, { Component, useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, LocateFixed, Save, Layers, Navigation, Map as MapIcon, Info } from 'lucide-react';
import { toast } from 'sonner';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from 'react-leaflet';

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
            Browser Anda mengalami kegagalan inisialisasi modul peta. Jangan khawatir, Anda masih dapat mengubah titik koordinat outlet secara presisi menggunakan kolom input angka di bawah ini.
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

const getCustomIcon = (number: number) => {
  return L.divIcon({
    className: 'custom-icon',
    html: `<div style="background-color: #cc0000; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; border: 2px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.3); margin-top: -14px; margin-left: -14px;">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

// Component to handle dynamic map center
function MapCenterUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (typeof center[0] === 'number' && typeof center[1] === 'number' && !isNaN(center[0]) && !isNaN(center[1])) {
      map.setView(center, map.getZoom());
    }
  }, [center[0], center[1], map]);
  return null;
}

export default function OutletMapManager({ outlets: initialOutlets, onSaveOutlets, saving }: OutletMapManagerProps) {
  // Always work with local copy so changes won't immediately commit to global state until Saved
  const [localOutlets, setLocalOutlets] = useState<Outlet[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [activeMapOutletIdx, setActiveMapOutletIdx] = useState<number>(0);

  // Synchronize with initialOutlets
  useEffect(() => {
    if (initialOutlets && initialOutlets.length > 0) {
      try {
        const cleaned = initialOutlets.map((o: any) => ({
          nama: o.nama || o.name || "",
          lat: typeof o.lat === 'number' ? o.lat : (parseFloat(String(o.lat)) || -6.2),
          lng: typeof o.lng === 'number' ? o.lng : (parseFloat(String(o.lng)) || 106.8),
          radius: typeof o.radius === 'number' ? o.radius : (parseInt(String(o.radius), 10) || 150)
        }));
        setLocalOutlets(cleaned);
      } catch (e) {
        console.error("Gagal parse initialOutlets:", e);
      }
    } else {
      setLocalOutlets([
        { nama: "YZ_ MDP PASIR JAHA BALARAJA", lat: -6.205649180689262, lng: 106.45134398119775, radius: 150 },
        { nama: "YZ_ MDP JAYANTI CIKANDE", lat: -6.206571510648256, lng: 106.38621792361727, radius: 150 }
      ]);
    }
  }, [initialOutlets]);

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

  // Get current device location for a specific outlet
  const useCurrentLocation = (index: number, outletName: string) => {
    if (!navigator.geolocation) {
      return toast.error("Browser tidak mendukung GPS Geolocation.");
    }

    const toastId = toast.loading(`Mendapatkan koordinat GPS untuk ${outletName}...`);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocalOutlets(prev => {
          const copy = [...prev];
          if (copy[index]) {
            copy[index] = {
              ...copy[index],
              lat: parseFloat(latitude.toFixed(15)),
              lng: parseFloat(longitude.toFixed(15))
            };
          }
          return copy;
        });
        setActiveMapOutletIdx(index);
        toast.success(`Berhasil mendapatkan koordinat lokasi Anda!`, { id: toastId });
      },
      (error) => {
        toast.error(`Gagal mendapatkan GPS: ${error.message}`, { id: toastId });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const saveSpecificOutlet = async (idxToSave: number, outletName: string) => {
    try {
      setSavingIdx(idxToSave);
      // Pass the updated localOutlets array up to persist in Sheet
      await onSaveOutlets(localOutlets);
      toast.success(`Berhasil menyimpan koordinat outlet ${outletName}`);
    } catch (err: any) {
      toast.error(`Gagal menyimpan outlet ${outletName}: ${err.message}`);
    } finally {
      setSavingIdx(null);
    }
  };

  const centerLat = localOutlets[activeMapOutletIdx]?.lat || -6.2;
  const centerLng = localOutlets[activeMapOutletIdx]?.lng || 106.8;

  return (
    <div className="w-full bg-white border border-neutral-200 rounded-xl shadow-sm p-6 flex flex-col gap-6">
      {/* Header section with Action Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
        <div>
          <h3 className="font-bold text-neutral-800 text-base flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#cc0000]" />
            Atur Koordinat Titik Lokasi &amp; Batasan Radius Outlet
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Silakan geser pin pada peta interaktif di bawah ini untuk mengatur titik koordinat outlet Anda. Gratis tanpa API key.
          </p>
        </div>
      </div>

      {localOutlets.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 bg-blue-50/50 p-3 rounded-lg border border-blue-100/50 text-xs text-blue-800">
             <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
             <p>Anda dapat menggeser pin angka pada peta untuk memindahkan titik lokasi outlet secara interaktif.</p>
          </div>
          
          <div className="h-[400px] w-full rounded-xl overflow-hidden border border-neutral-200 shadow-sm relative z-0">
            <MapErrorBoundary>
              <MapContainer center={[centerLat, centerLng]} zoom={15} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <MapCenterUpdater center={[centerLat, centerLng]} />
                
                {localOutlets.map((out, idx) => {
                  const outLat = typeof out.lat === 'number' ? out.lat : parseFloat(String(out.lat)) || -6.2;
                  const outLng = typeof out.lng === 'number' ? out.lng : parseFloat(String(out.lng)) || 106.8;
                  
                  // Leaflet custom icon
                  const iconHtml = `<div style="background-color: #cc0000; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; border: 2px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.3); margin-top: -14px; margin-left: -14px;">${idx + 1}</div>`;
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
                              handleCoordinateChange(idx, 'lat', pos.lat);
                              handleCoordinateChange(idx, 'lng', pos.lng);
                              setActiveMapOutletIdx(idx);
                            }
                          },
                          click: () => {
                             setActiveMapOutletIdx(idx);
                          }
                        }}
                      >
                        <Popup>
                          <div className="font-bold text-sm text-neutral-800">{out.nama}</div>
                          <div className="text-xs text-neutral-500 mt-0.5">Radius: {out.radius}m</div>
                          <div className="text-[10px] bg-red-50 text-red-700 px-2 py-1 mt-2 rounded font-medium border border-red-100">
                            Anda dapat menahan dan menggeser pin ini
                          </div>
                        </Popup>
                      </Marker>
                      <Circle 
                        center={[outLat, outLng]} 
                        radius={out.radius} 
                        pathOptions={{ 
                          color: activeMapOutletIdx === idx ? '#cc0000' : '#888888', 
                          fillColor: activeMapOutletIdx === idx ? '#cc0000' : '#888888', 
                          fillOpacity: activeMapOutletIdx === idx ? 0.15 : 0.1,
                          weight: activeMapOutletIdx === idx ? 2 : 1
                        }}
                      />
                    </React.Fragment>
                  );
                })}
              </MapContainer>
            </MapErrorBoundary>
          </div>
        </div>
      )}

      {/* Grid of Responsive Outlet Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {localOutlets.map((out, idx) => {
          const isActive = activeMapOutletIdx === idx;
          const outLat = typeof out.lat === 'number' ? out.lat : parseFloat(String(out.lat)) || -6.2;
          const outLng = typeof out.lng === 'number' ? out.lng : parseFloat(String(out.lng)) || 106.8;

          return (
            <div 
              key={idx}
              onClick={() => setActiveMapOutletIdx(idx)}
              className={`bg-neutral-50 hover:bg-neutral-50/80 border ${isActive ? 'border-[#cc0000] ring-1 ring-[#cc0000]' : 'border-neutral-200'} rounded-xl p-5 shadow-sm transition flex flex-col gap-4 relative cursor-pointer`}
            >
              {/* Outlet Header */}
              <div className="flex items-start gap-2.5 border-b border-neutral-200/60 pb-3">
                <div className={`p-2 rounded-lg shrink-0 flex items-center justify-center font-bold text-sm w-9 h-9 ${isActive ? 'bg-[#cc0000] text-white shadow-md' : 'bg-red-100/60 text-[#cc0000]'}`}>
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h4 className="text-sm font-bold text-neutral-800 leading-snug break-words">{out.nama}</h4>
                  <div className="font-mono text-[10px] text-neutral-500 mt-1 space-x-2">
                    <span>{outLat.toFixed(6)}, {outLng.toFixed(6)}</span>
                  </div>
                </div>
              </div>

              {/* Editable Coordinates Fields */}
              <div className="grid grid-cols-2 gap-2" onClick={e => e.stopPropagation()}>
                <div>
                  <label className="block text-[9px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Latitude</label>
                  <input 
                    type="number" 
                    step="any"
                    value={out.lat} 
                    onChange={e => handleCoordinateChange(idx, 'lat', parseFloat(e.target.value) || 0)}
                    className="w-full text-xs font-mono bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Longitude</label>
                  <input 
                    type="number" 
                    step="any"
                    value={out.lng} 
                    onChange={e => handleCoordinateChange(idx, 'lng', parseFloat(e.target.value) || 0)}
                    className="w-full text-xs font-mono bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500 font-medium"
                  />
                </div>
              </div>

              {/* Slider Radius */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wide">Batas Radius Absen</label>
                  <span className="text-xs font-bold text-[#cc0000] font-mono bg-red-50 border border-red-150 px-2 py-0.5 rounded shadow-sm">
                    {out.radius} meter
                  </span>
                </div>
                
                <div className="flex items-center gap-3 bg-white p-2.5 border border-neutral-205 rounded-lg shadow-sm" onClick={e => e.stopPropagation()}>
                  <input
                    type="range"
                    min="55"
                    max="1000"
                    step="5"
                    value={out.radius}
                    onChange={(e) => handleRadiusChange(idx, e.target.value)}
                    className="w-full accent-[#cc0000] cursor-pointer"
                  />
                  <div className="flex items-center gap-1 shrink-0 bg-neutral-100 border border-neutral-200 px-2 py-1 rounded font-bold text-xs font-mono">
                    <input
                      type="number"
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
                     className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-neutral-200/80 hover:bg-neutral-300 active:bg-neutral-350 text-neutral-800 text-[11px] font-bold rounded-lg transition text-center cursor-pointer shadow-sm select-none"
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

