import React, { useState, useEffect } from 'react';
import { MapPin, LocateFixed, Save, Layers, Navigation } from 'lucide-react';
import { toast } from 'sonner';

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

export default function OutletMapManager({ outlets: initialOutlets, onSaveOutlets, saving }: OutletMapManagerProps) {
  // Always work with local copy so changes won't immediately commit to global state until Saved
  const [localOutlets, setLocalOutlets] = useState<Outlet[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  // Synchronize with initialOutlets
  useEffect(() => {
    if (initialOutlets && initialOutlets.length > 0) {
      setLocalOutlets(JSON.parse(JSON.stringify(initialOutlets)));
    } else {
      setLocalOutlets([
        { nama: "YZ_ MDP PASIR JAHA BALARAJA", lat: -6.205649180689262, lng: 106.45134398119775, radius: 150 },
        { nama: "YZ_ MDP JAYANTI CIKANDE", lat: -6.206571510648256, lng: 106.38621792361727, radius: 150 }
      ]);
    }
  }, [initialOutlets]);

  const handleCoordinateChange = (index: number, field: 'lat' | 'lng', valueStr: string) => {
    const floatVal = parseFloat(valueStr);
    setLocalOutlets(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = {
          ...copy[index],
          [field]: isNaN(floatVal) ? 0 : floatVal
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
    } catch (err: any) {
      toast.error(`Gagal menyimpan outlet ${outletName}: ${err.message}`);
    } finally {
      setSavingIdx(null);
    }
  };

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
            Silakan atur koordinat lintang/bujur dan radius absen masing-masing outlet langsung dari panel di bawah ini tanpa memuat Google Maps API.
          </p>
        </div>
      </div>

      {/* Grid of Responsive Outlet Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {localOutlets.map((out, idx) => {
          return (
            <div 
              key={idx}
              className="bg-neutral-50 hover:bg-neutral-50/80 border border-neutral-200 rounded-xl p-5 shadow-sm transition flex flex-col gap-4 relative"
            >
              {/* Outlet Header */}
              <div className="flex items-start gap-2.5 border-b border-neutral-200/60 pb-3">
                <div className="p-2 bg-red-100/60 text-[#cc0000] rounded-lg shrink-0">
                  <MapPin className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider block">Outlet #{idx + 1}</span>
                  <h4 className="text-sm font-bold text-neutral-800 leading-snug break-words mt-0.5">{out.nama}</h4>
                </div>
              </div>

              {/* Form Inputs (Latitude & Longitude) */}
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Latitude (Lintang)</label>
                  <input
                    type="number"
                    step="any"
                    value={out.lat}
                    onChange={(e) => handleCoordinateChange(idx, 'lat', e.target.value)}
                    className="w-full p-2 bg-white border border-neutral-300 rounded focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none font-mono text-xs shadow-sm transition"
                    placeholder="Contoh: -6.12345"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Longitude (Bujur)</label>
                  <input
                    type="number"
                    step="any"
                    value={out.lng}
                    onChange={(e) => handleCoordinateChange(idx, 'lng', e.target.value)}
                    className="w-full p-2 bg-white border border-neutral-300 rounded focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none font-mono text-xs shadow-sm transition"
                    placeholder="Contoh: 106.12345"
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
                
                <div className="flex items-center gap-3 bg-white p-2.5 border border-neutral-205 rounded-lg shadow-sm">
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

              {/* Individual Action Buttons (Easily clickable) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-neutral-200/50 mt-1">
                <button
                  type="button"
                  onClick={() => useCurrentLocation(idx, out.nama)}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-neutral-200/80 hover:bg-neutral-300 active:bg-neutral-350 text-neutral-800 text-xs font-bold rounded-lg transition text-center cursor-pointer shadow-sm select-none"
                >
                  <LocateFixed className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                  Isi Lokasi GPS Saya
                </button>

                <button
                  type="button"
                  onClick={() => saveSpecificOutlet(idx, out.nama)}
                  disabled={saving}
                  className="w-full bg-[#cc0000] hover:bg-[#a30000] text-white font-bold text-xs py-2 rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer uppercase tracking-wider select-none text-center"
                >
                  <Save className="w-3.5 h-3.5 shrink-0" />
                  {saving && savingIdx === idx ? 'Menyimpan...' : 'Simpan Koordinat'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
