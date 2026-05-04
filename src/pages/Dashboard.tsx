import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, setDoc } from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../lib/settingsObject";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "../components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { MapPin, Settings, Users, Activity, CheckCircle2, LogOut, Briefcase } from "lucide-react";

import { QRCodeSVG } from 'qrcode.react';
import { WaveBackground } from "../components/WaveBackground";
import { SHIFTS } from "../constants";

export default function Dashboard() {
  const { user } = useAuth();
  const settings = useSettings();
  const navigate = useNavigate();

  const [attendances, setAttendances] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Print context
  const [selectedUserForCard, setSelectedUserForCard] = useState<any | null>(null);

  const pendingApprovalsCount = attendances.filter(log => log.status === 'pending_approval').length;

  useEffect(() => {
    if (pendingApprovalsCount > 0) {
      toast.info(`Terdapat ${pendingApprovalsCount} absensi yang menunggu persetujuan.`, { 
        id: 'pending-approvals',
        duration: 20000,
      });
    } else {
      toast.dismiss('pending-approvals');
    }
  }, [pendingApprovalsCount]);

  // Settings forms
  const [radiusInput, setRadiusInput] = useState(100);
  const [latInput, setLatInput] = useState(-6.2088);
  const [lngInput, setLngInput] = useState(106.8456);
  const [shiftStartInput, setShiftStartInput] = useState("09:00");
  const [shiftEndInput, setShiftEndInput] = useState("17:00");
  const [appNameInput, setAppNameInput] = useState("ABSENKU");
  const [appLogoUrlInput, setAppLogoUrlInput] = useState("");

  useEffect(() => {
    if (settings) {
      setRadiusInput(settings.radiusMeters);
      setLatInput(settings.officeLat);
      setLngInput(settings.officeLng);
      setShiftStartInput(settings.shiftStart || "09:00");
      setShiftEndInput(settings.shiftEnd || "17:00");
      setAppNameInput(settings.appName || "ABSENKU");
      setAppLogoUrlInput(settings.appLogoUrl || "");
    }
  }, [settings]);

  useEffect(() => {
    const q = query(collection(db, "attendance"), orderBy("timestamp", "desc"), limit(50));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAttendances(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "attendance");
    });
    
    // Admin list user roles
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const uData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsersList(uData);
    }, (error) => {
       console.log('Cant list users', error);
    });

    return () => { unsub(); unsubUsers(); };
  }, []);

  const toggleGeofence = async (checked: boolean) => {
    try {
      setLoadingConfig(true);
      await setDoc(doc(db, "settings", "global"), {
        ...settings,
        geofenceEnabled: checked
      }, { merge: true });
      toast.success(`Geofence ${checked ? 'Diaktifkan' : 'Dimatikan'}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "settings/global");
    } finally {
      setLoadingConfig(false);
    }
  };

  const saveSettings = async () => {
    try {
      setLoadingConfig(true);
      await setDoc(doc(db, "settings", "global"), {
        ...settings,
        radiusMeters: Number(radiusInput),
        officeLat: Number(latInput),
        officeLng: Number(lngInput),
        shiftStart: shiftStartInput,
        shiftEnd: shiftEndInput,
        appName: appNameInput,
        appLogoUrl: appLogoUrlInput,
      }, { merge: true });
      toast.success("Pengaturan berhasil disimpan");
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, "settings/global");
    } finally {
      setLoadingConfig(false);
    }
  };

  const [selectedUserForEdit, setSelectedUserForEdit] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editShift, setEditShift] = useState("");

  const handleEditUser = (user: any) => {
    setSelectedUserForEdit(user);
    setEditName(user.name || "");
    setEditRole(user.role || "");
    setEditShift(user.shiftId || "shift1");
  };

  const saveUserChanges = async () => {
    if (!selectedUserForEdit) return;
    try {
      await updateDoc(doc(db, "users", selectedUserForEdit.id), {
        name: editName,
        role: editRole,
        shiftId: editShift
      });
      toast.success("Data pegawai diperbarui successfully");
      setSelectedUserForEdit(null);
    } catch (err) {
      toast.error("Gagal memperbarui data pegawai");
    }
  };

  return (
    <WaveBackground>
      <div className="py-4 sm:py-8 px-4 max-w-7xl mx-auto space-y-6 sm:space-y-8">
        {/* Header */}
        <header className="relative h-auto sm:h-32 bg-teal-600 dark:bg-teal-800 overflow-hidden shrink-0 rounded-2xl shadow-lg mb-6 pb-6 sm:pb-0">
          <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-none transform translate-y-[1px] opacity-30">
            <svg viewBox="0 0 1440 320" className="w-full h-12 md:h-20" preserveAspectRatio="none">
              <path fill="currentColor" className="text-teal-50 dark:text-gray-900" d="M0,192L48,208C96,224,192,256,288,245.3C384,235,480,181,576,176C672,171,768,213,864,229.3C960,245,1056,235,1152,208C1248,181,1344,139,1392,117.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
            </svg>
          </div>
          <div className="relative z-10 p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start text-white gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-3 drop-shadow-md">
                {settings?.appLogoUrl ? (
                  <img src={settings.appLogoUrl} alt="Logo" className="w-10 h-10 object-contain brightness-0 invert" />
                ) : (
                  <Activity className="w-8 h-8" />
                )}
                {settings?.appName || "ABSENKU"} <span className="font-light opacity-80 font-sans tracking-widest text-sm ml-1 uppercase">Admin</span>
              </h1>
              <p className="text-teal-50/80 text-xs sm:text-sm font-medium tracking-wide">Monitoring real-time presence and cloud sync status</p>
            </div>
            <div className="flex gap-4 text-right items-center">
               <div className="flex flex-col justify-center text-right mr-1">
                <span className="font-bold text-sm tracking-tight">{user?.name}</span>
                <span className="text-[10px] text-teal-100/70 uppercase tracking-widest font-black">{user?.role}</span>
               </div>
               
               <div className="flex gap-2">
                 <Button variant="outline" size="sm" className="bg-white/10 hover:bg-white/20 border-white/20 text-white font-bold h-10 rounded-xl backdrop-blur-md" onClick={() => navigate('/app')}>
                    Aplikasi 
                 </Button>

                 <Button variant="outline" size="sm" className="bg-white/10 hover:bg-white/20 border-white/20 text-white font-bold h-10 w-10 p-0 rounded-xl backdrop-blur-md" onClick={() => auth.signOut()} title="Keluar">
                    <LogOut className="w-5 h-5" />
                 </Button>
               </div>
            </div>
          </div>
        </header>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-md border border-teal-100 dark:border-teal-900 p-1.5 rounded-2xl shadow-sm flex flex-col sm:flex-row h-auto w-full sm:w-auto gap-1">
            <TabsTrigger value="overview" className="w-full sm:w-auto rounded-xl data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-sm font-bold text-slate-500 dark:text-gray-400 relative py-2.5 px-5 transition-all">
              <Activity className="w-4 h-4 mr-2" /> Overview
              {pendingApprovalsCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-5 w-5 bg-rose-500 text-[10px] text-white items-center justify-center font-black shadow-sm">
                    {pendingApprovalsCount}
                  </span>
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="users" className="w-full sm:w-auto rounded-xl data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-sm font-bold text-slate-500 dark:text-gray-400 py-2.5 px-5 transition-all"><Users className="w-4 h-4 mr-2" /> Pegawai</TabsTrigger>
            <TabsTrigger value="settings" className="w-full sm:w-auto rounded-xl data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-sm font-bold text-slate-500 dark:text-gray-400 py-2.5 px-5 transition-all"><Settings className="w-4 h-4 mr-2" /> Pengaturan</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl border-0 shadow-xl overflow-hidden p-0">
              <CardHeader className="border-b border-teal-50 dark:border-teal-900 p-6 m-0 bg-transparent flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0">
                <div>
                  <CardTitle className="text-teal-900 dark:text-teal-50 font-black text-xl tracking-tight">Real-Time Live Logs</CardTitle>
                  <CardDescription className="text-xs font-medium text-slate-500 dark:text-gray-400">Daftar absensi terbaru dari seluruh pegawai</CardDescription>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" className="bg-white dark:bg-gray-700 border-teal-100 dark:border-teal-900 rounded-xl text-xs font-bold text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900 h-10 w-full sm:w-auto transition-all" onClick={() => {
                  const csvData = attendances.map(log => [
                    log.userId, format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss"), log.type, log.method, log.withinRadius
                  ].join(',')).join('\n');
                  const blob = new Blob([`User ID,Waktu,Tipe,Metode,Dalam Radius\n${csvData}`], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `absensi_${format(new Date(), 'yyyyMMdd')}.csv`;
                  a.click();
                }}>
                  <Activity className="w-4 h-4 mr-2" /> Export Spreadsheet
                </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="w-full text-left">
                    <TableHeader className="bg-teal-50/50 dark:bg-teal-900/20 text-teal-900 dark:text-teal-100">
                      <TableRow className="border-b border-teal-100 dark:border-teal-900 hover:bg-transparent">
                        <TableHead className="px-6 py-4 h-auto text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300 w-[200px]">Waktu</TableHead>
                        <TableHead className="px-6 py-4 h-auto text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300">Pegawai</TableHead>
                        <TableHead className="px-6 py-4 h-auto text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300">Tipe</TableHead>
                        <TableHead className="px-6 py-4 h-auto text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300">Metode</TableHead>
                        <TableHead className="px-6 py-4 h-auto text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300">Status Geofence</TableHead>
                        <TableHead className="px-6 py-4 h-auto text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300 text-center">Foto</TableHead>
                        <TableHead className="px-6 py-4 h-auto text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300 text-center">Tindakan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs divide-y divide-teal-50 dark:divide-teal-900/50">
                      {attendances.map((log) => (
                        <TableRow key={log.id} className="hover:bg-teal-50/50 dark:hover:bg-teal-900/10 border-0 transition-colors">
                          <TableCell className="px-6 py-4 font-bold text-slate-600 dark:text-gray-300">
                            {format(new Date(log.timestamp), "dd MMM, HH:mm:ss")}
                          </TableCell>
                          <TableCell className="px-6 py-4 font-mono text-[11px] font-black text-teal-600 dark:text-teal-400 uppercase">{log.userId}</TableCell>
                          <TableCell className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${log.type === 'in' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' : log.type === 'out' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' : log.type === 'overtime_in' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : log.type === 'overtime_out' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300' : log.type === 'sick' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : ['permit', 'cuti', 'melahirkan', 'meninggal'].includes(log.type) ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                              {log.type === 'in' ? 'MASUK' : log.type === 'out' ? 'PULANG' : log.type === 'overtime_in' ? 'LEMBUR MSK' : log.type === 'overtime_out' ? 'LEMBUR PLG' : log.type === 'sick' ? 'SAKIT' : log.type === 'permit' ? 'IZIN' : log.type === 'cuti' ? 'CUTI' : log.type === 'melahirkan' ? 'HAMIL' : log.type === 'meninggal' ? 'BERDUKA' : log.type}
                            </span>
                          </TableCell>
                          <TableCell className="px-6 py-4 uppercase text-[10px] font-black text-slate-600 dark:text-gray-400 tracking-widest">
                            <span className={`${log.method === 'rfid' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900 dark:text-blue-300 border-blue-200 dark:border-blue-800' : 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-gray-300 border-slate-200 dark:border-gray-600'} px-2.5 py-1 rounded-lg border inline-block`}>{log.method}</span>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            {log.withinRadius ? (
                              <span className="text-teal-600 dark:text-teal-400 font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Di Lokasi</span>
                            ) : (
                              <span className="text-rose-500 font-bold flex items-center gap-1 underline underline-offset-4 decoration-rose-500/30 font-mono">LUAR RADIUS</span>
                            )}
                          </TableCell>
                          <TableCell className="px-6 py-4 text-center">
                            {log.photoBase64 ? (
                              <a href={log.photoBase64} target="_blank" rel="noreferrer" className="text-teal-600 dark:text-teal-400 font-black hover:underline text-[11px] transition-all">LIHAT FOTO</a>
                            ) : (
                              <span className="text-slate-400 text-[10px]">-</span>
                            )}
                          </TableCell>
                          <TableCell className="px-6 py-4 text-center">
                            {log.status === "pending_approval" ? (
                              <div className="flex justify-center gap-2">
                                <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest px-3 bg-teal-50 text-teal-600 border-teal-200 hover:bg-teal-600 hover:text-white transition-all rounded-xl shadow-sm" onClick={async () => {
                                  try {
                                    await updateDoc(doc(db, "attendance", log.id), { status: "approved" });
                                    toast.success("Absensi disetujui");
                                  } catch (e) {
                                    toast.error("Gagal menyetujui");
                                  }
                                }}>OK</Button>
                                <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest px-3 bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-600 hover:text-white transition-all rounded-xl shadow-sm" onClick={async () => {
                                  try {
                                    await updateDoc(doc(db, "attendance", log.id), { status: "rejected" });
                                    toast.success("Absensi ditolak");
                                  } catch (e) {
                                    toast.error("Gagal menolak");
                                  }
                                }}>NO</Button>
                              </div>
                            ) : (
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${log.status === 'rejected' ? 'bg-rose-500 text-white' : log.status === 'approved' ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-500 dark:bg-gray-700 dark:text-gray-300'}`}>
                                {log.status || 'APPROVED'}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {attendances.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12 text-slate-400 italic">
                            Belum ada riwayat aktivitas absensi hari ini.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl border-0 shadow-xl overflow-hidden p-0">
              <CardHeader className="border-b border-teal-50 dark:border-teal-900 p-6 m-0 bg-transparent flex flex-col space-y-1">
                <CardTitle className="text-teal-900 dark:text-teal-50 font-black text-xl tracking-tight">Employee Directory</CardTitle>
                <CardDescription className="text-xs font-medium text-slate-500 dark:text-gray-400">Manajemen data akun, peran, dan kartu akses digital pegawai.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="w-full text-left">
                    <TableHeader className="bg-teal-50/50 dark:bg-teal-900/20 text-teal-900 dark:text-teal-100">
                      <TableRow className="border-b border-teal-100 dark:border-teal-900 hover:bg-transparent">
                        <TableHead className="px-6 py-4 h-auto text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300">Nama Pegawai</TableHead>
                        <TableHead className="px-6 py-4 h-auto text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300">Kontak Email</TableHead>
                        <TableHead className="px-6 py-4 h-auto text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300">Jabatan</TableHead>
                        <TableHead className="px-6 py-4 h-auto text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300 px-6">Bergabung</TableHead>
                        <TableHead className="px-6 py-4 h-auto text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300">Shift</TableHead>
                        <TableHead className="px-6 py-4 h-auto text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300 text-right px-6">Navigasi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs divide-y divide-teal-50 dark:divide-teal-900/50">
                      {usersList.map((usr) => (
                        <TableRow key={usr.id} className="hover:bg-teal-50/50 dark:hover:bg-teal-900/10 border-0 transition-colors">
                          <TableCell className="px-6 py-4 font-bold text-teal-900 dark:text-teal-50 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-teal-100 dark:bg-teal-900 border-2 border-white dark:border-teal-800 flex items-center justify-center font-black text-teal-700 dark:text-teal-300 overflow-hidden shrink-0 shadow-sm">
                              {usr.avatarUrl ? <img src={usr.avatarUrl} className="w-full h-full object-cover" /> : usr.name?.[0]}
                            </div>
                            <span className="tracking-tight">{usr.name}</span>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-slate-500 dark:text-gray-400 font-medium">{usr.email}</TableCell>
                          <TableCell className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${usr.role === 'superadmin' ? 'bg-rose-500/20 text-rose-600' : usr.role === 'admin' ? 'bg-teal-500/20 text-teal-600' : 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-gray-300'}`}>{usr.role}</span>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <span 
                              className="px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase text-white shadow-sm"
                              style={{ backgroundColor: usr.shiftId ? SHIFTS[usr.shiftId as keyof typeof SHIFTS]?.color || '#64748b' : '#64748b' }}
                            >
                              {usr.shiftId ? SHIFTS[usr.shiftId as keyof typeof SHIFTS]?.name || usr.shiftId : "NO SHIFT"}
                            </span>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-slate-500 dark:text-gray-400 font-medium">{usr.createdAt ? format(new Date(usr.createdAt), "dd MMM yyyy") : "-"}</TableCell>
                          <TableCell className="px-6 py-4 text-right px-6 flex items-center justify-end gap-2">
                             <Button variant="outline" size="sm" className="h-9 px-3 text-[10px] font-black tracking-widest uppercase rounded-xl border-teal-100 dark:border-teal-900 text-teal-600 dark:text-teal-400 hover:bg-teal-50 shadow-sm" onClick={() => handleEditUser(usr)}>Edit</Button>
                             <Button variant="outline" size="sm" className="h-9 px-3 text-[10px] font-black tracking-widest uppercase rounded-xl border-teal-100 dark:border-teal-900 text-teal-600 dark:text-teal-400 hover:bg-teal-600 hover:text-white transition-all shadow-sm" onClick={() => setSelectedUserForCard(usr)}>ID Card</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {usersList.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                            Sedang sinkronisasi data pegawai...
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl border-0 shadow-xl p-6">
                <div className="text-teal-700 dark:text-teal-300 text-[10px] font-black mb-6 uppercase tracking-widest flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Geofence Configuration
                </div>
                <div className="space-y-8">
                  <div className="flex items-center justify-between p-5 bg-teal-50/50 dark:bg-teal-900/20 rounded-2xl border border-teal-100 dark:border-teal-900/50 shadow-inner">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-black text-teal-900 dark:text-teal-50 tracking-tight uppercase">GEOFENCE RADIUS: {settings?.geofenceEnabled ? <span className="text-teal-600">AKTIF</span> : <span className="text-rose-500">NON-AKTIF</span>}</Label>
                      <p className="text-[10px] text-teal-600/70 dark:text-teal-400 font-bold tracking-wider">Aktifkan untuk membatasi lokasi absensi pegawai</p>
                    </div>
                    <Switch 
                      checked={settings?.geofenceEnabled || false} 
                      onCheckedChange={toggleGeofence} 
                      disabled={loadingConfig}
                      className="data-[state=checked]:bg-teal-600"
                    />
                  </div>

                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-widest">Radius Deteksi (Meter)</Label>
                      <Input 
                        className="border-teal-100 dark:border-teal-900 bg-white dark:bg-gray-900 h-10 text-sm font-bold rounded-xl focus-visible:ring-teal-600"
                        type="number" 
                        value={radiusInput} 
                        onChange={(e) => setRadiusInput(Number(e.target.value))} 
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-widest">Latitude Titik Pusat</Label>
                        <Input 
                          className="border-teal-100 dark:border-teal-900 bg-white dark:bg-gray-900 h-10 text-sm font-bold rounded-xl focus-visible:ring-teal-600 font-mono"
                          type="number" 
                          step="0.000001"
                          value={latInput} 
                          onChange={(e) => setLatInput(Number(e.target.value))} 
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-widest">Longitude Titik Pusat</Label>
                        <Input 
                          className="border-teal-100 dark:border-teal-900 bg-white dark:bg-gray-900 h-10 text-sm font-bold rounded-xl focus-visible:ring-teal-600 font-mono"
                          type="number" 
                          step="0.000001"
                          value={lngInput} 
                          onChange={(e) => setLngInput(Number(e.target.value))} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl border-0 shadow-xl p-6 flex flex-col">
                <div className="text-teal-700 dark:text-teal-300 text-[10px] font-black mb-6 uppercase tracking-widest flex items-center gap-2">
                   <Activity className="w-4 h-4" /> Attendance Shift Hours
                </div>
                <div className="space-y-6 flex-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-widest">Start Shift / Late Gate</Label>
                      <Input 
                        className="border-teal-100 dark:border-teal-900 bg-white dark:bg-gray-900 h-10 text-sm font-bold rounded-xl focus-visible:ring-teal-600"
                        type="time" 
                        value={shiftStartInput} 
                        onChange={(e) => setShiftStartInput(e.target.value)} 
                      />
                      <p className="text-[9px] text-slate-400 font-medium">Batas terakhir absen masuk tepat waktu</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-widest">End Shift / Early Gate</Label>
                      <Input 
                        className="border-teal-100 dark:border-teal-900 bg-white dark:bg-gray-900 h-10 text-sm font-bold rounded-xl focus-visible:ring-teal-600"
                        type="time" 
                        value={shiftEndInput} 
                        onChange={(e) => setShiftEndInput(e.target.value)} 
                      />
                      <p className="text-[9px] text-slate-400 font-medium">Batas tercepat absen pulang standar</p>
                    </div>
                  </div>
                </div>
                <Button onClick={saveSettings} disabled={loadingConfig} className="w-full bg-teal-600 hover:bg-teal-700 h-12 rounded-2xl text-xs font-black uppercase tracking-widest text-white shadow-lg mt-8 transition-all active:scale-95">
                  SIMPAN PENGATURAN GEOLOKASI
                </Button>
              </Card>

              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl border-0 shadow-xl p-6 flex flex-col md:col-span-2">
                <div className="text-teal-700 dark:text-teal-300 text-[10px] font-black mb-6 uppercase tracking-widest flex items-center gap-2">
                   <Briefcase className="w-4 h-4" /> Shift Configuration Info
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-teal-50/50 dark:bg-teal-900/20 p-4 rounded-2xl border border-teal-100 dark:border-teal-900/50">
                    <h4 className="text-xs font-black text-teal-800 dark:text-teal-200 uppercase mb-2">Shift 1 (Pagi)</h4>
                    <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 font-medium">
                      <li>• Senin-Jumat: 06:00 - 14:00</li>
                      <li>• Sabtu: 07:00 - 12:00</li>
                      <li>• Minggu: <span className="text-rose-500 font-bold uppercase">Libur</span></li>
                    </ul>
                  </div>
                  <div className="bg-blue-50/50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/50">
                    <h4 className="text-xs font-black text-blue-800 dark:text-blue-200 uppercase mb-2">Shift 2 (Siang)</h4>
                    <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 font-medium">
                      <li>• Senin-Jumat: 13:00 - 21:00</li>
                      <li>• Sabtu: <span className="text-rose-500 font-bold uppercase">Libur</span></li>
                      <li>• Minggu: 07:00 - 12:00</li>
                    </ul>
                  </div>
                  <div className="bg-purple-50/50 dark:bg-purple-900/20 p-4 rounded-2xl border border-purple-100 dark:border-purple-900/50">
                    <h4 className="text-xs font-black text-purple-800 dark:text-purple-200 uppercase mb-2">Shift 3 (Malam)</h4>
                    <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 font-medium">
                      <li>• Setiap Hari: 21:00 - 06:00</li>
                      <li className="text-[9px] text-purple-600/60 mt-2 italic">* Additional working condition</li>
                    </ul>
                  </div>
                </div>
              </Card>

              <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl border-0 shadow-xl p-6 md:col-span-2">
                <div className="text-teal-700 dark:text-teal-300 text-[10px] font-black mb-6 uppercase tracking-widest flex items-center gap-2">
                   <Settings className="w-4 h-4" /> Brand Identity Config
                </div>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-widest">Nama Platform Kerja</Label>
                      <Input 
                        className="border-teal-100 dark:border-teal-900 bg-white dark:bg-gray-900 h-10 text-sm font-bold rounded-xl focus-visible:ring-teal-600"
                        placeholder="NUSAWORK / ABSENKU"
                        value={appNameInput} 
                        onChange={(e) => setAppNameInput(e.target.value)} 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-widest">URL Logo Branding (PNG Transparent Recommended)</Label>
                      <Input 
                        className="border-teal-100 dark:border-teal-900 bg-white dark:bg-gray-900 h-10 text-sm font-bold rounded-xl focus-visible:ring-teal-600"
                        placeholder="https://yourdomain.com/logo.png"
                        value={appLogoUrlInput} 
                        onChange={(e) => setAppLogoUrlInput(e.target.value)} 
                      />
                    </div>
                  </div>
                  <Button onClick={saveSettings} disabled={loadingConfig} className="w-full bg-teal-600 hover:bg-teal-700 h-12 rounded-2xl text-xs font-black uppercase tracking-widest text-white shadow-lg mt-2 transition-all active:scale-95">
                    PERBARUI IDENTITAS APLIKASI
                  </Button>
                </div>
              </Card>
            </div>
          </TabsContent>
          
        </Tabs>

        {/* Member Card Creation Dialog */}
        <Dialog open={!!selectedUserForCard} onOpenChange={(open) => !open && setSelectedUserForCard(null)}>
          <DialogContent className="sm:max-w-2xl bg-white dark:bg-gray-900 border-0 rounded-[2.5rem] shadow-2xl p-0 overflow-hidden outline-none ring-0">
            {selectedUserForCard && (
              <div className="flex flex-col items-center p-8">
                <div 
                  id="member-card-print"
                  className="bg-white border border-slate-200 overflow-hidden relative shadow-2xl flex"
                  style={{ 
                    width: '85.6mm', 
                    height: '54mm', 
                    borderRadius: '4mm',
                    fontFamily: 'system-ui, sans-serif'
                  }}
                >
                   {/* Background Elements */}
                   <div className="absolute top-0 left-0 w-full h-full bg-teal-600/5 pointer-events-none"></div>
                   <div className="absolute top-0 right-0 w-1/3 h-full bg-teal-600/10 skew-x-[-15deg] translate-x-12 pointer-events-none"></div>
                   
                   {/* Left Side: Photo & QR */}
                   <div className="w-[30%] h-full flex flex-col items-center justify-center border-r border-teal-100/50 p-3 bg-teal-50/30">
                      <div className="w-16 h-16 rounded-lg bg-teal-100 border-2 border-white shadow-md overflow-hidden mb-3">
                        {selectedUserForCard.avatarUrl ? (
                           <img src={selectedUserForCard.avatarUrl} className="w-full h-full object-cover" alt="Avatar" />
                        ) : (
                           <div className="w-full h-full flex items-center justify-center font-black text-teal-300 text-2xl">
                             {selectedUserForCard.name ? selectedUserForCard.name[0] : "P"}
                           </div>
                        )}
                      </div>
                      <div className="bg-white p-1 rounded-lg shadow-sm border border-teal-100">
                         <QRCodeSVG value={selectedUserForCard.id} size={50} level="M" />
                      </div>
                      <p className="text-[5px] font-black text-teal-800/40 uppercase mt-2 tracking-widest">ID: {selectedUserForCard.id.slice(0, 8)}...</p>
                   </div>

                   {/* Right Side: Info */}
                   <div className="flex-1 h-full p-4 flex flex-col justify-between relative">
                      <div className="flex justify-between items-start">
                         <div>
                            <p className="text-[6px] font-black text-teal-600 uppercase tracking-widest mb-0.5">{settings?.appName || "ABSENKU"}</p>
                            <h2 className="text-[14px] font-black text-teal-950 uppercase tracking-tighter leading-none mb-1">{selectedUserForCard.name}</h2>
                            <p className="text-[7px] font-bold text-slate-500 uppercase tracking-wider">{selectedUserForCard.email}</p>
                         </div>
                         {settings?.appLogoUrl ? (
                            <img src={settings.appLogoUrl} alt="Logo" className="w-6 h-6 object-contain" />
                         ) : (
                            <Activity className="w-6 h-6 text-teal-600" />
                         )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-2">
                         <div className="space-y-0.5">
                            <p className="text-[5px] font-black text-slate-400 uppercase tracking-[0.2em]">JABATAN</p>
                            <p className="text-[8px] font-black text-teal-800 uppercase">{selectedUserForCard.role}</p>
                         </div>
                         <div className="space-y-0.5">
                            <p className="text-[5px] font-black text-slate-400 uppercase tracking-[0.2em]">SHIFT KERJA</p>
                            <div className="flex items-center gap-1">
                               <div 
                                 className="w-1.5 h-1.5 rounded-full" 
                                 style={{ backgroundColor: selectedUserForCard.shiftId ? SHIFTS[selectedUserForCard.shiftId as keyof typeof SHIFTS]?.color || '#94a3b8' : '#94a3b8' }}
                               ></div>
                               <p className="text-[8px] font-black text-teal-800 uppercase">
                                 {selectedUserForCard.shiftId ? SHIFTS[selectedUserForCard.shiftId as keyof typeof SHIFTS]?.name || "CUSTOM" : "NO SHIFT"}
                               </p>
                            </div>
                         </div>
                         <div className="space-y-0.5">
                            <p className="text-[5px] font-black text-slate-400 uppercase tracking-[0.2em]">BERGABUNG</p>
                            <p className="text-[8px] font-black text-teal-800 uppercase">{selectedUserForCard.createdAt ? format(new Date(selectedUserForCard.createdAt), "dd MMM yyyy") : "-"}</p>
                         </div>
                         <div className="space-y-0.5">
                            <p className="text-[5px] font-black text-slate-400 uppercase tracking-[0.2em]">STATUS</p>
                            <p className="text-[8px] font-black text-teal-600 uppercase">ACTIVE MEMBER</p>
                         </div>
                      </div>

                      <div className="absolute bottom-3 right-4 opacity-10 rotate-[-15deg] pointer-events-none">
                         <Activity className="w-12 h-12 text-teal-900" />
                      </div>
                   </div>
                </div>

                <div className="flex justify-between gap-4 w-full mt-8 max-w-[85.6mm]">
                  <Button variant="ghost" className="flex-1 text-slate-400 dark:text-gray-500 font-bold tracking-widest uppercase text-xs hover:text-rose-500 transition-colors h-12 rounded-2xl" onClick={() => setSelectedUserForCard(null)}>Batal</Button>
                  <Button onClick={() => {
                    const printContents = document.getElementById("member-card-print")?.outerHTML;
                    if (printContents) {
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html>
                            <head>
                              <title>Print Card - ${selectedUserForCard.name}</title>
                              <script src="https://cdn.tailwindcss.com"></script>
                              <style>
                                @media print {
                                  @page { size: auto; margin: 0; }
                                  body { margin: 10mm; padding: 0; background: white; -webkit-print-color-adjust: exact; }
                                  #print-container { display: block !important; }
                                }
                              </style>
                            </head>
                            <body onload="setTimeout(() => { window.print(); window.close(); }, 500)">
                              <div id="print-container" style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f1f5f9;">
                                ${printContents}
                              </div>
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                      }
                    }
                  }} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-black tracking-widest uppercase text-xs h-12 shadow-lg shadow-teal-600/20 rounded-2xl active:scale-95 transition-all">CETAK KARTU (85.6x54mm)</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={!!selectedUserForEdit} onOpenChange={(open) => !open && setSelectedUserForEdit(null)}>
          <DialogContent className="sm:max-w-md bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl border-0 shadow-2xl rounded-[2rem]">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-xl font-black text-teal-900 dark:text-teal-50 uppercase tracking-tighter">Edit Data Pegawai</DialogTitle>
              <CardDescription className="text-xs font-bold text-slate-500 uppercase tracking-widest">Update profile & shift information</CardDescription>
            </DialogHeader>
            {selectedUserForEdit && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-teal-700 dark:text-teal-300 uppercase tracking-[0.2em] ml-1">Nama Lengkap</Label>
                  <Input 
                    value={editName} 
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-900/50 border-teal-100 dark:border-teal-900 h-12 rounded-2xl font-bold text-teal-900 dark:text-teal-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-teal-700 dark:text-teal-300 uppercase tracking-[0.2em] ml-1">Jabatan / Role</Label>
                  <select 
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-teal-100 dark:border-teal-900 h-12 rounded-2xl font-bold text-teal-900 dark:text-teal-50 px-4 focus:ring-2 focus:ring-teal-500/20 transition-all outline-none"
                  >
                    <option value="superadmin">SUPERADMIN</option>
                    <option value="admin">ADMIN</option>
                    <option value="staff">STAFF</option>
                    <option value="crew">CREW</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-teal-700 dark:text-teal-300 uppercase tracking-[0.2em] ml-1">Penempatan Shift</Label>
                  <select 
                    value={editShift}
                    onChange={(e) => setEditShift(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-teal-100 dark:border-teal-900 h-12 rounded-2xl font-bold text-teal-900 dark:text-teal-50 px-4 focus:ring-2 focus:ring-teal-500/20 transition-all outline-none"
                  >
                    {Object.entries(SHIFTS).map(([id, s]) => (
                      <option key={id} value={id}>{s.name} ({s.label})</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button variant="ghost" className="flex-1 text-slate-400 font-bold uppercase text-xs h-12 rounded-2xl" onClick={() => setSelectedUserForEdit(null)}>Batal</Button>
                  <Button onClick={saveUserChanges} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-black tracking-widest uppercase text-xs h-12 shadow-lg shadow-teal-600/20 rounded-2xl active:scale-95 transition-all">SIMPAN PERUBAHAN</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </WaveBackground>
  );
}
