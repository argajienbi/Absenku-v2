import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useSettings, calculateDistance } from "../lib/settingsObject";
import { collection, query, where, onSnapshot, doc, setDoc } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { format, isSameDay, isWeekend } from "date-fns";
import { id } from "date-fns/locale";
import Webcam from "react-webcam";
import { Html5QrcodeScanner } from "html5-qrcode";
import { useTheme } from "next-themes";
import { verifyFace } from "../lib/faceVerification";
import {
  MapPin, LogOut, Code, UserSquare2, Fingerprint, CalendarDays,
  Home, User, Settings as SettingsIcon, Sun, Moon, Briefcase, ArrowLeft
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Calendar } from "../components/ui/calendar";

export default function UserApp() {
  const { user } = useAuth();
  const settings = useSettings();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [isWithinRadius, setIsWithinRadius] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"home" | "absen" | "history" | "profile">("home");
  
  // Home states
  const [type, setType] = useState<"in" | "out" | "overtime_in" | "overtime_out">("in");
  const [activeAbsenTab, setActiveAbsenTab] = useState("selfie");
  const webcamRef = useRef<Webcam>(null);
  const [rfidInput, setRfidInput] = useState("");

  // History states
  const [myHistory, setMyHistory] = useState<any[]>([]);

  const getStatusForDate = React.useCallback((date: Date) => {
    const isToday = isSameDay(date, new Date());
    const isFuture = date > new Date() && !isToday;
    const isWeekendDay = isWeekend(date);

    if (isFuture) return null;

    const dayLogs = myHistory.filter(log => isSameDay(new Date(log.timestamp), date));
    
    // Explicit manual overrides via extra data/features in future:
    const sickLog = dayLogs.find(l => l.type === 'sick');
    if (sickLog) return 'sick';
    const permitLog = dayLogs.find(l => l.type === 'permit');
    if (permitLog) return 'permit'; 

    const inLogs = dayLogs.filter(l => l.type === 'in');
    const outLogs = dayLogs.filter(l => l.type === 'out');

    if (inLogs.length === 0 && outLogs.length === 0) {
        if (!isWeekendDay && !isToday) return 'alpa'; 
        return null;
    }

    if (inLogs.length > 0) {
        const sortedIn = [...inLogs].sort((a,b) => a.timestamp - b.timestamp);
        const firstInLog = sortedIn[0];
        
        let isLate = false;
        if (firstInLog.status === 'pending_approval' || firstInLog.status === 'rejected') {
          isLate = true; // Still considered late flag until approved
        } else if (!firstInLog.status) {
          // Fallback legacy calculation
          const firstInDate = new Date(firstInLog.timestamp);
          const shiftStartStr = settings?.shiftStart || "09:00";
          const [startHour, startMin] = shiftStartStr.split(':').map(Number);
          isLate = (firstInDate.getHours() > startHour) || (firstInDate.getHours() === startHour && firstInDate.getMinutes() > startMin);
        }

        if (outLogs.length === 0 && !isToday) {
            return 'lupa_pulang';
        }

        if (isLate) return 'telat';
        return 'hadir'; // in time
    }

    return null;
  }, [myHistory, settings]);

  const pendingCount = myHistory.filter(log => log.status === 'pending_approval').length;

  const summary = React.useMemo(() => {
     let telatCount = 0;
     let ijinCount = 0;
     let alpaCount = 0;
     let lemburHours = 0;
     
     const now = new Date();
     for (let i = 1; i <= now.getDate(); i++) {
        const date = new Date(now.getFullYear(), now.getMonth(), i);
        const status = getStatusForDate(date);
        
        if (status === 'telat') telatCount++;
        if (status === 'sick' || status === 'permit') ijinCount++;
        if (status === 'alpa') alpaCount++;
        
        const dayLogs = myHistory.filter(log => isSameDay(new Date(log.timestamp), date));
        const lemburIn = dayLogs.filter(l => l.type === 'overtime_in').sort((a,b) => a.timestamp - b.timestamp);
        const lemburOut = dayLogs.filter(l => l.type === 'overtime_out').sort((a,b) => b.timestamp - a.timestamp);
        
        if (lemburIn.length > 0 && lemburOut.length > 0) {
            const mSecs = lemburOut[0].timestamp - lemburIn[0].timestamp;
            if (mSecs > 0) {
               lemburHours += mSecs / (1000 * 60 * 60);
            }
        }
     }
     
     return { telatCount, ijinCount, alpaCount, lemburHours };
  }, [myHistory, getStatusForDate]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "attendance"), where("userId", "==", user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a: any, b: any) => b.timestamp - a.timestamp);
      setMyHistory(data);
    }, (error) => {
      console.error("Error fetching personal history", error);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLocation({ lat: latitude, lng: longitude });
          if (settings) {
            const dist = calculateDistance(latitude, longitude, settings.officeLat, settings.officeLng);
            setDistance(dist);
            setIsWithinRadius(!settings.geofenceEnabled || dist <= settings.radiusMeters);
          }
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
      );
    }
  }, [settings]);

  useEffect(() => {
    if (view === "absen" && activeAbsenTab === "qr") {
      try {
        const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
        scanner.render((decodedText) => {
          scanner.clear();
          handleAttendance("qr", decodedText);
        }, undefined);
        return () => { scanner.clear().catch(console.error); };
      } catch (e) {
        console.error("QR scanner error: ", e);
      }
    }
  }, [view, activeAbsenTab, type]);

  const handleAttendance = async (method: "selfie" | "qr" | "rfid", extraData?: string) => {
    if (!user) return;
    if (settings?.geofenceEnabled && !isWithinRadius) {
      toast.error("Anda berada di luar radius kantor!");
      return;
    }

    setLoading(true);
    let photoBase64 = null;
    try {
      if (method === "selfie") {
        photoBase64 = webcamRef.current?.getScreenshot();
        if (!photoBase64) {
          toast.error("Gagal mengambil foto. Pastikan kamera diizinkan dan siap digunakan.");
          setLoading(false);
          return;
        }
        
        if (user.avatarUrl) {
          try {
             toast.info("Memverifikasi wajah...");
             const isSamePerson = await verifyFace(photoBase64, user.avatarUrl);
             if (!isSamePerson) {
                toast.error("Verifikasi Wajah Gagal. Wajah tidak cocok dengan profil Anda.");
                setLoading(false);
                return;
             }
          } catch (e) {
             console.error("Verification failed", e);
             toast.error("Gagal verifikasi wajah, melanjutkan dengan absen biasa.");
          }
        } else {
           toast.error("Profil Anda tidak memiliki foto. Tidak dapat memverifikasi wajah.");
           setLoading(false);
           return;
        }
      }

      const now = new Date();
      let status = "approved"; // default OK
      
      if (type === "in") {
        const shiftStartStr = settings?.shiftStart || "09:00";
        const [startHour, startMin] = shiftStartStr.split(':').map(Number);
        const isLate = (now.getHours() > startHour) || (now.getHours() === startHour && now.getMinutes() > startMin);
        if (isLate) status = "pending_approval";
      } else if (type === "out") {
        const shiftEndStr = settings?.shiftEnd || "17:00";
        const [endHour, endMin] = shiftEndStr.split(':').map(Number);
        const isEarlyLeave = (now.getHours() < endHour) || (now.getHours() === endHour && now.getMinutes() < endMin);
        if (isEarlyLeave) status = "pending_approval";
      } else if (type === "overtime_in" || type === "overtime_out") {
        status = "pending_approval"; // Lembur perlu approval admin
      }

      if (method === "qr") {
        status = "pending_approval"; // QR code attendance always requires approval
      }

      const attendanceId = `att_${Date.now()}_${user.uid}`;
      await setDoc(doc(db, "attendance", attendanceId), {
        userId: user.uid,
        timestamp: Date.now(),
        type,
        method,
        photoBase64: photoBase64 || "",
        location: location || { lat: 0, lng: 0 },
        withinRadius: isWithinRadius,
        extraData: extraData || "",
        status
      });

      const formatTypeRaw = (t: string) => {
        if (t === 'in') return 'Masuk';
        if (t === 'out') return 'Pulang';
        if (t === 'overtime_in') return 'Lembur Masuk';
        return 'Lembur Pulang';
      };

      toast.success(`Berhasil Absen ${formatTypeRaw(type)}${status === "pending_approval" ? " (Menunggu Approval Admin)" : ""}`);
      if (method === 'rfid') setRfidInput("");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `attendance`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden font-sans relative">
      <div className="flex-1 overflow-y-auto pb-24 relative">
        {/* Header */}
        <div className="relative bg-teal-500 pb-20 pt-8 px-6 dark:bg-teal-800 shrink-0">
          <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-none transform translate-y-[1px]">
            <svg viewBox="0 0 1440 320" className="w-full h-12 md:h-16" preserveAspectRatio="none">
              <path fill="currentColor" className="text-gray-50 dark:text-gray-900" d="M0,192L48,208C96,224,192,256,288,245.3C384,235,480,181,576,176C672,171,768,213,864,229.3C960,245,1056,235,1152,208C1248,181,1344,139,1392,117.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
            </svg>
          </div>
          <div className="relative z-10 flex justify-between items-center text-white">
             <div>
                <p className="text-teal-100 dark:text-teal-200 text-xs uppercase tracking-wider font-semibold">Selamat datang,</p>
                <h1 className="text-2xl font-bold tracking-tight">{user?.name}</h1>
             </div>
             {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="avatar" className="w-12 h-12 rounded-full border-2 border-white object-cover shadow-sm bg-teal-600" />
             ) : (
                <div className="w-12 h-12 rounded-full bg-teal-600 border-2 border-white flex items-center justify-center font-bold shadow-sm">{user?.name?.[0]}</div>
             )}
          </div>
        </div>

        {/* Content Area overlapped */}
        <div className="relative z-20 px-4 -mt-12 space-y-6 max-w-lg mx-auto">
           {view === "home" && (
             <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                {pendingCount > 0 && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700/50 text-yellow-800 dark:text-yellow-400 px-4 py-3 rounded-2xl flex items-center justify-between shadow-sm animate-in fade-in">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse shrink-0 drop-shadow-sm"></div>
                      <span className="text-xs font-medium">Anda memiliki <b>{pendingCount} absen menuggu approval.</b></span>
                    </div>
                  </div>
                )}
                
                <Card className="bg-white dark:bg-gray-800 shadow-lg shadow-teal-500/5 dark:shadow-none rounded-2xl border-0 overflow-hidden text-center p-6">
                  <h2 className="text-4xl font-bold text-gray-800 dark:text-gray-100 tracking-tight leading-none mb-1">
                    {format(currentTime, "HH:mm:ss")}
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 font-medium text-sm mt-1">
                    {format(currentTime, "EEEE, dd MMMM yyyy", { locale: id })}
                  </p>
                  
                  <div className="mt-6 flex flex-col items-center">
                    <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700 px-4 py-2 rounded-full border border-gray-100 dark:border-gray-600">
                      <MapPin className={`w-4 h-4 ${isWithinRadius ? 'text-teal-500' : 'text-red-500'}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${isWithinRadius ? 'text-teal-600 dark:text-teal-400' : 'text-red-500'}`}>
                        {location ? (distance !== null ? `Jarak: ${Math.round(distance)}m` : "Menghitung...") : "Mencari lokasi..."}
                      </span>
                    </div>
                  </div>
                </Card>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => { setType("in"); setView("absen"); }}
                    className="p-6 bg-teal-500 hover:bg-teal-600 dark:bg-teal-600 dark:hover:bg-teal-700 text-white rounded-2xl flex flex-col items-center justify-center font-bold shadow-lg transition-transform active:scale-95"
                  >
                    <Briefcase className="w-8 h-8 mb-2 opacity-80" />
                    <span className="text-sm">Absen Masuk</span>
                  </button>
                  <button 
                    onClick={() => { setType("out"); setView("absen"); }}
                    className="p-6 bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700 text-white rounded-2xl flex flex-col items-center justify-center font-bold shadow-lg transition-transform active:scale-95"
                  >
                    <LogOut className="w-8 h-8 mb-2 opacity-80" />
                    <span className="text-sm">Absen Pulang</span>
                  </button>
                  <button 
                    onClick={() => { setType("overtime_in"); setView("absen"); }}
                    className="p-6 bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700 text-white rounded-2xl flex flex-col items-center justify-center font-bold shadow-lg transition-transform active:scale-95"
                  >
                    <Briefcase className="w-8 h-8 mb-2 opacity-80" />
                    <span className="text-sm">Lembur Masuk</span>
                  </button>
                  <button 
                    onClick={() => { setType("overtime_out"); setView("absen"); }}
                    className="p-6 bg-rose-500 hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-700 text-white rounded-2xl flex flex-col items-center justify-center font-bold shadow-lg transition-transform active:scale-95"
                  >
                    <LogOut className="w-8 h-8 mb-2 opacity-80" />
                    <span className="text-sm">Lembur Pulang</span>
                  </button>
                </div>
             </div>
           )}

           {view === "absen" && (
             <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center mb-2 px-2">
                   <button onClick={() => setView('home')} className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-300">
                      <ArrowLeft className="w-5 h-5" />
                   </button>
                   <h2 className="text-xl font-bold ml-2 dark:text-gray-100">
                      Proses Absen {type === 'in' ? 'Masuk' : type === 'out' ? 'Pulang' : type === 'overtime_in' ? 'Lembur Masuk' : 'Lembur Pulang'}
                   </h2>
                </div>

                <Card className="bg-white dark:bg-gray-800 shadow-md rounded-2xl border-0">
                  <CardContent className="p-4">
                    <Tabs value={activeAbsenTab} onValueChange={setActiveAbsenTab} className="w-full">
                      <TabsList className="grid w-full grid-cols-3 mb-6 bg-gray-50 dark:bg-gray-700/50 p-1 rounded-lg h-auto">
                        <TabsTrigger value="selfie" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[9px] sm:text-[10px] font-semibold py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-600"><UserSquare2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span>Selfie</span></TabsTrigger>
                        <TabsTrigger value="qr" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[9px] sm:text-[10px] font-semibold py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-600"><Code className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span>QR Scan</span></TabsTrigger>
                        <TabsTrigger value="rfid" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[9px] sm:text-[10px] font-semibold py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-600"><Fingerprint className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span>RFID</span></TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="selfie" className="space-y-4">
                        <div className="aspect-video bg-gray-900 rounded-xl overflow-hidden relative shadow-inner">
                          <Webcam
                            audio={false}
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            className="w-full h-full object-cover"
                            videoConstraints={{ facingMode: "user" }}
                          />
                          <div className="absolute inset-0 border-4 border-dashed border-white/30 m-4 rounded-lg pointer-events-none"></div>
                        </div>
                        <Button 
                          className={`w-full text-xs font-bold uppercase tracking-wider h-11 shadow-sm text-white ${type === 'in' ? 'bg-teal-600 hover:bg-teal-700' : type === 'overtime_in' ? 'bg-amber-600 hover:bg-amber-700' : type === 'overtime_out' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-purple-600 hover:bg-purple-700'}`} 
                          onClick={() => handleAttendance("selfie")} 
                          disabled={loading || (settings?.geofenceEnabled && !isWithinRadius)}
                        >
                          {loading ? "Memproses..." : `Take Selfie & ${type.includes('in') ? 'Masuk' : 'Pulang'}`}
                        </Button>
                      </TabsContent>

                      <TabsContent value="qr" className="space-y-4">
                        <div id="qr-reader" className="overflow-hidden rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"></div>
                        <p className="text-center text-xs text-gray-500 dark:text-gray-400">Arahkan kamera ke QR Code absen.</p>
                      </TabsContent>

                      <TabsContent value="rfid" className="space-y-4 py-8">
                        <div className="text-center space-y-4 max-w-[250px] mx-auto">
                          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Fingerprint className="w-8 h-8 text-gray-400 animate-pulse" />
                          </div>
                          <h3 className="font-medium text-gray-700 dark:text-gray-200 text-sm">Scan Kartu RFID Anda</h3>
                          <Input 
                            autoFocus 
                            type="password" 
                            placeholder="Tap kartu ke reader..." 
                            value={rfidInput}
                            className="text-center bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                            onChange={(e) => setRfidInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAttendance("rfid", rfidInput);
                            }}
                          />
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
             </div>
           )}

           {view === "history" && (
             <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <h2 className="text-xl font-bold px-2 flex items-center gap-2 dark:text-gray-100">
                  <CalendarDays className="w-5 h-5 text-teal-600 dark:text-teal-400" /> Rekap Kehadiran
                </h2>
                
                <h2 className="text-xl font-bold px-2 flex items-center gap-2 dark:text-gray-100 mb-2 mt-4">
                  <CalendarDays className="w-5 h-5 text-teal-600 dark:text-teal-400" /> Ringkasan Bulan Ini
                </h2>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <div className="bg-yellow-50 dark:bg-yellow-900/40 p-3 rounded-2xl text-center flex flex-col items-center shadow-sm">
                     <span className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{summary.telatCount}</span>
                     <span className="text-[9px] uppercase tracking-wider font-bold text-yellow-700/60 dark:text-yellow-500">Telat</span>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/40 p-3 rounded-2xl text-center flex flex-col items-center shadow-sm">
                     <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{summary.ijinCount}</span>
                     <span className="text-[9px] uppercase tracking-wider font-bold text-blue-700/60 dark:text-blue-500">Ijin</span>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/40 p-3 rounded-2xl text-center flex flex-col items-center shadow-sm">
                     <span className="text-lg font-bold text-red-600 dark:text-red-400">{summary.alpaCount}</span>
                     <span className="text-[9px] uppercase tracking-wider font-bold text-red-700/60 dark:text-red-500">Alpa</span>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/40 p-3 rounded-2xl text-center flex flex-col items-center shadow-sm">
                     <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{summary.lemburHours.toFixed(1)}</span>
                     <span className="text-[9px] uppercase tracking-wider font-bold text-amber-700/60 dark:text-amber-500">Jam Lmbr</span>
                  </div>
                </div>

                <Card className="bg-white dark:bg-gray-800 shadow-sm border-0 pt-2 pb-4">
                   <div className="flex justify-center">
                     <Calendar
                        mode="single"
                        locale={id}
                        defaultMonth={new Date()}
                        // selected removed so user doesn't get confused by the black square
                        className="p-3"
                        modifiers={{
                           hadir: (day) => getStatusForDate(day) === 'hadir',
                           telat: (day) => getStatusForDate(day) === 'telat',
                           lupa_pulang: (day) => getStatusForDate(day) === 'lupa_pulang',
                           alpa: (day) => getStatusForDate(day) === 'alpa',
                           sick: (day) => getStatusForDate(day) === 'sick',
                           permit: (day) => getStatusForDate(day) === 'permit'
                        }}
                        modifiersClassNames={{
                           hadir: "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-teal-500 after:rounded-full",
                           telat: "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-yellow-500 after:rounded-full",
                           lupa_pulang: "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-orange-500 after:rounded-full",
                           alpa: "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-red-500 after:rounded-full",
                           sick: "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-blue-500 after:rounded-full",
                           permit: "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-blue-300 after:rounded-full"
                        }}
                     />
                   </div>
                   
                   <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-[10px] uppercase font-bold text-gray-500 px-4">
                      <div className="flex gap-1.5 items-center"><span className="w-2 h-2 rounded-full bg-teal-500"></span> Tepat</div>
                      <div className="flex gap-1.5 items-center"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> Telat</div>
                      <div className="flex gap-1.5 items-center"><span className="w-2 h-2 rounded-full bg-orange-500"></span> Tdk Pulang</div>
                      <div className="flex gap-1.5 items-center"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Sakit/Ijin</div>
                      <div className="flex gap-1.5 items-center"><span className="w-2 h-2 rounded-full bg-red-500"></span> Alpa</div>
                   </div>
                </Card>

                {myHistory.length === 0 ? (
                  <Card className="bg-white dark:bg-gray-800 shadow-sm border-0">
                    <CardContent className="p-8 text-center text-gray-500 dark:text-gray-400">
                       Belum ada riwayat absensi.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3 pb-8">
                    {myHistory.map((log) => (
                      <Card key={log.id} className="bg-white dark:bg-gray-800 border-0 shadow-sm rounded-xl overflow-hidden">
                        <div className="flex p-4 items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${log.type === 'in' ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400' : log.type === 'overtime_in' ? 'bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' : log.type === 'overtime_out' ? 'bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400' : 'bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'}`}>
                              {(log.type === 'in' || log.type === 'overtime_in') ? <Briefcase className="w-5 h-5"/> : <LogOut className="w-5 h-5"/>}
                            </div>
                            <div>
                               <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">
                                 {log.type === 'in' ? 'Masuk' : log.type === 'out' ? 'Pulang' : log.type === 'overtime_in' ? 'Lembur Msk' : 'Lembur Plg'}
                               </p>
                               <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">{format(new Date(log.timestamp), "dd MMM yyyy")}</p>
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end">
                             <p className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">{format(new Date(log.timestamp), "HH:mm")}</p>
                             <div className="flex items-center gap-1 mt-1">
                               {log.status === "pending_approval" && <span className="inline-block px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[8px] uppercase font-bold">Pending</span>}
                               {log.status === "rejected" && <span className="inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[8px] uppercase font-bold">Ditolak</span>}
                               <span className="inline-block px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[9px] uppercase font-bold text-gray-600 dark:text-gray-300">
                                  {log.method}
                               </span>
                             </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
             </div>
           )}

           {view === "profile" && (
             <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
               <Card className="bg-white dark:bg-gray-800 shadow-sm rounded-2xl border-0 overflow-hidden text-center p-6">
                 {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="avatar" className="w-20 h-20 mx-auto rounded-full border-4 border-gray-50 dark:border-gray-700 object-cover shadow-sm mb-3 bg-teal-100 dark:bg-teal-900" />
                 ) : (
                    <div className="w-20 h-20 mx-auto rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-2xl shadow-sm mb-3 border-4 border-gray-50 dark:border-gray-700">{user?.name?.[0]}</div>
                 )}
                 <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{user?.name}</h2>
                 <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                 <span className="inline-block mt-3 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] uppercase tracking-widest font-bold rounded">
                   ROLE: {user?.role}
                 </span>
               </Card>

               <div className="space-y-2">
                 <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-2 py-1">Pengaturan</div>
                 
                 <Card className="bg-white dark:bg-gray-800 border-0 shadow-sm rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/50">
                    <button 
                      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                         {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-indigo-500" />}
                         {theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
                      </div>
                    </button>

                    {(user?.role === 'admin' || user?.role === 'superadmin') && (
                      <button 
                        onClick={() => navigate('/dashboard')}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 text-sm font-semibold text-teal-600 dark:text-teal-400">
                           <SettingsIcon className="w-5 h-5" />
                           Admin Dashboard
                        </div>
                      </button>
                    )}

                    <button 
                      onClick={() => auth.signOut()}
                      className="w-full flex items-center justify-between p-4 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <div className="flex items-center gap-3 text-sm font-semibold text-red-500">
                         <LogOut className="w-5 h-5" />
                         Keluar
                      </div>
                    </button>
                 </Card>
               </div>
             </div>
           )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="absolute bottom-0 left-0 w-full bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-800 flex justify-around py-2 px-2 z-50 pb-[env(safe-area-inset-bottom,0.5rem)] shadow-[0_-4px_15px_rgba(0,0,0,0.03)] dark:shadow-[0_-4px_15px_rgba(0,0,0,0.2)]">
        <button onClick={() => setView('home')} className={`flex flex-col flex-1 items-center gap-1.5 p-2 rounded-xl transition-colors ${view === 'home' ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-wide">Home</span>
        </button>
        <button onClick={() => setView('history')} className={`flex flex-col flex-1 items-center gap-1.5 p-2 rounded-xl transition-colors ${view === 'history' ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
          <CalendarDays className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-wide">Riwayat</span>
        </button>
        <button onClick={() => setView('profile')} className={`flex flex-col flex-1 items-center gap-1.5 p-2 rounded-xl transition-colors ${view === 'profile' ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
          <User className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-wide">Profil</span>
        </button>
      </div>
    </div>
  );
}
